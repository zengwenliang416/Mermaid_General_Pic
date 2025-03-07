<template>
  <!-- 对话框部分，设置teleport将其移到body上，成为页面级别的元素 -->
  <teleport to="body">
    <el-dialog
      v-model="dialogVisible"
      :title="t('download.title')"
      width="500px"
      class="download-dialog"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :append-to-body="true"
      destroy-on-close
    >
      <el-form :model="form" label-width="120px" class="download-form">
        <el-form-item :label="t('download.filename')">
          <el-input 
            v-model="form.filename" 
            :placeholder="t('download.filename_placeholder')"
            clearable
          />
        </el-form-item>
        <el-form-item :label="t('download.format')">
          <el-select 
            v-model="form.format" 
            style="width: 100%"
            :placeholder="t('download.format_placeholder')"
          >
            <el-option
              v-for="format in store.supportedFormats"
              :key="format"
              :label="format.toUpperCase()"
              :value="format"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('download.dpi')">
          <el-input-number
            v-model="form.dpi"
            :min="store.dpiRange.min"
            :max="store.dpiRange.max"
            :step="100"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item :label="t('download.theme')">
          <el-select 
            v-model="form.theme" 
            style="width: 100%"
            :placeholder="t('download.theme_placeholder')"
          >
            <el-option
              v-for="theme in store.supportedThemes"
              :key="theme"
              :label="t(`theme.${theme}`)"
              :value="theme"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('download.background')">
          <el-select 
            v-model="form.background" 
            style="width: 100%"
            :placeholder="t('download.background_placeholder')"
          >
            <el-option
              v-for="bg in store.supportedBackgrounds"
              :key="bg"
              :label="t(`background.${bg}`)"
              :value="bg"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
          <el-button
            type="primary"
            @click="handleDownload"
            :loading="downloading"
          >
            {{ t('common.download') }}
          </el-button>
        </span>
      </template>
    </el-dialog>
  </teleport>

  <!-- 下载按钮，点击时显示对话框 -->
  <el-button
    type="primary"
    :disabled="!code"
    @click="dialogVisible = true"
  >
    <el-icon><Download /></el-icon>
    {{ t('preview.download') }}
  </el-button>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue';
import { Download } from '@element-plus/icons-vue';
import { useMermaidStore } from '../stores/mermaid';
import { ElMessage } from 'element-plus';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const props = defineProps<{
  code: string;
}>();

const store = useMermaidStore();
const dialogVisible = ref(false);
const downloading = ref(false);

const form = reactive({
  filename: 'mermaid-picture',
  format: store.format,
  dpi: store.dpi,
  theme: store.theme,
  background: store.background,
});

const handleOpen = async () => {
  if (store.supportedFormats.length === 0) {
    await store.fetchFormats();
  }
  form.format = store.format;
  form.dpi = store.dpi;
  form.theme = store.theme;
  form.background = store.background;
};

watch(dialogVisible, (newValue) => {
  if (newValue) {
    handleOpen();
  }
});

const handleDownload = async () => {
  if (!props.code) return;

  downloading.value = true;
  try {
    // 直接通过创建一个隐藏的<a>元素实现下载，避免影响预览区域
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
    
    // 使用POST请求确保大型代码可以正确传递
    const response = await fetch(`${baseUrl}/api/mermaid/convert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code: props.code,
        format: form.format,
        dpi: form.dpi,
        theme: form.theme,
        background: form.background
      })
    });
    
    if (!response.ok) {
      throw new Error(`服务器响应错误: ${response.status}`);
    }
    
    // 获取响应的Blob
    const blob = await response.blob();
    
    // 创建下载链接
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${form.filename}.${form.format}`;
    document.body.appendChild(link);
    
    // 记录日志
    console.log('创建下载链接:', link.href);
    
    // 点击链接执行下载
    link.click();
    
    // 清理
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);

    // 关闭对话框
    dialogVisible.value = false;
    
    // 显示成功消息
    ElMessage.success(t('download.success'));
  } catch (err) {
    console.error('Download failed:', err);
    ElMessage.error(t('download.error'));
  } finally {
    downloading.value = false;
  }
};
</script>

<style scoped>
.download-dialog :deep(.el-dialog__body) {
  padding: 20px 30px;
}

.download-form :deep(.el-form-item) {
  margin-bottom: 20px;
}

.download-form :deep(.el-form-item__label) {
  font-weight: 500;
}

.download-form :deep(.el-input__wrapper),
.download-form :deep(.el-select__wrapper) {
  box-shadow: none;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
}

.download-form :deep(.el-input__wrapper:hover),
.download-form :deep(.el-select__wrapper:hover) {
  border-color: #409eff;
}

.download-form :deep(.el-input__wrapper.is-focus),
.download-form :deep(.el-select__wrapper.is-focus) {
  border-color: #409eff;
  box-shadow: 0 0 0 1px #409eff;
}

.download-form :deep(.el-input-number .el-input__wrapper) {
  padding-right: 0;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style> 