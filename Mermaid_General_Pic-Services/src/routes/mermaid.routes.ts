import express, { Request, Response, Router } from 'express';
import multer from 'multer';
import path from 'path';
import { MermaidService } from '../services/mermaid.service';
import { logWithContext } from '../utils/logger';
import { config } from '../config/config';
import fs from 'fs';

// 配置文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.staticDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: config.maxFileSize
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (config.allowedFileTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

const router: Router = express.Router();

// 获取支持的格式
router.get('/formats', (req: Request, res: Response) => {
  res.json({
    formats: config.outputFormats,
    themes: config.themes,
    backgrounds: config.backgrounds,
    dpiRange: config.dpiRange
  });
});

// 转换 Mermaid 代码为图片
router.post('/convert', async (req: Request, res: Response) => {
  try {
    const { code, format = 'png', dpi = config.dpiRange.default, theme = 'default', background = 'white' } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Missing code parameter' });
    }

    const result = await MermaidService.generateDiagram(code, format, dpi, theme, background);

    // 设置响应头
    if (format === 'svg') {
      res.setHeader('Content-Type', 'image/svg+xml');
    } else if (format === 'jpg') {
      res.setHeader('Content-Type', 'image/jpeg');
    } else {
      res.setHeader('Content-Type', `image/${format}`);
    }
    
    // 添加CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // 添加Content-Disposition头，但不强制下载
    res.setHeader('Content-Disposition', `inline; filename="mermaid-diagram.${format}"`);
    
    // 提供下载位置的自定义头
    const fileId = path.basename(result.path).split('.')[0];
    const downloadUrl = `http://${req.headers.host || 'localhost:' + config.port}/static/images/${fileId}.${format}`;
    res.setHeader('X-Download-Url', downloadUrl);
    
    // 防止缓存
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // 如果有缓存的数据，直接发送
    if (result.data) {
      // 记录下载地址
      console.log(`Sending diagram data, format: ${format}, size: ${result.data.length} bytes`);
      console.log(`Download URL: ${downloadUrl}`);
      return res.end(result.data);
    }

    // 否则从文件系统读取
    const fullPath = path.join(process.cwd(), result.path);
    console.log(`Sending diagram file: ${fullPath}`);
    console.log(`Download URL: ${downloadUrl}`);
    return res.sendFile(fullPath);
  } catch (error: any) {
    const errorMessage = error?.message || 'Unknown error';
    logWithContext('error', 'Failed to convert Mermaid code', {
      error: errorMessage,
      stack: error?.stack
    });
    res.status(500).json({ error: errorMessage });
  }
});

// 上传文件并转换
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const result = await MermaidService.generateDiagram(
      await fs.promises.readFile(req.file.path, 'utf8'),
      'png',
      config.dpiRange.default,
      'default',
      'white'
    );

    // 删除临时文件
    await fs.promises.unlink(req.file.path);

    res.json({ url: `/static/${path.basename(result.path)}` });
  } catch (error: any) {
    const errorMessage = error?.message || 'Unknown error';
    logWithContext('error', 'Failed to convert uploaded file', {
      error: errorMessage,
      stack: error?.stack
    });
    res.status(500).json({ error: errorMessage });
  }
});

// 专用下载路由 - 使用GET方法和查询参数
router.get('/download', async (req: Request, res: Response) => {
  try {
    const { 
      code, 
      format = 'png', 
      dpi = config.dpiRange.default, 
      theme = 'default', 
      background = 'white',
      filename = 'mermaid-diagram'
    } = req.query;

    if (!code) {
      return res.status(400).json({ error: 'Missing code parameter' });
    }

    // 生成图表
    const result = await MermaidService.generateDiagram(
      code as string, 
      format as any, 
      Number(dpi), 
      theme as any, 
      background as any
    );

    // 设置强制下载的响应头
    if (format === 'svg') {
      res.setHeader('Content-Type', 'image/svg+xml');
    } else if (format === 'jpg') {
      res.setHeader('Content-Type', 'image/jpeg');
    } else {
      res.setHeader('Content-Type', `image/${format}`);
    }
    
    // 强制下载
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.${format}"`);
    
    // 添加CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // 禁止缓存
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // 获取文件路径和URL，用于日志
    const fileId = path.basename(result.path).split('.')[0];
    const fileUrl = `/static/images/${fileId}.${format}`;
    const absolutePath = path.join(process.cwd(), 'static/images', `${fileId}.${format}`);
    
    // 记录下载
    console.log(`Download requested: ${absolutePath}`);
    console.log(`Download URL: http://${req.headers.host}${fileUrl}`);
    
    // 发送文件
    if (result.data) {
      return res.end(result.data);
    } else {
      return res.sendFile(path.join(process.cwd(), result.path));
    }
  } catch (error: any) {
    const errorMessage = error?.message || 'Unknown error';
    logWithContext('error', 'Failed to download diagram', {
      error: errorMessage,
      stack: error?.stack
    });
    res.status(500).json({ error: errorMessage });
  }
});

export default router; 