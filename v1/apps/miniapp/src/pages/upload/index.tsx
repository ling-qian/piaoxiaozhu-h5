import { View, Text, Image, Picker, Progress } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState, useRef, useCallback, useEffect } from 'react';
import { fileApi } from '../../services/api';
import { useStore } from '../../store';
import './index.scss';

type UploadStep = 'idle' | 'uploading' | 'ocr_processing' | 'archived' | 'ocr_done' | 'ocr_failed';

interface UploadTask {
  filePath: string;
  step: UploadStep;
  progress: number;
  fileId?: string;
  recordId?: string;
  recordData?: any;
  /** image / xml / ofd。文档类没有缩略图，且不走 OCR 轮询 */
  contentKind?: string;
}

export default function Upload() {
  const { projects, currentProject, fetchProjects, setCurrentProject } = useStore();
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const pollingMapRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  useEffect(() => {
    return () => {
      pollingMapRef.current.forEach((timer) => clearInterval(timer));
      pollingMapRef.current.clear();
    };
  }, []);

  Taro.useDidShow(async () => {
    await fetchProjects();
    const params = Taro.getCurrentInstance().router?.params;
    if (params?.projectId) {
      const store = useStore.getState();
      const found = store.projects.find((p) => p.id === params.projectId);
      if (found) setCurrentProject(found);
    }
  });

  const selectedProjectIndex = currentProject
    ? projects.findIndex((p) => p.id === currentProject.id)
    : -1;

  const updateTask = useCallback((filePath: string, patch: Partial<UploadTask>) => {
    setTasks((prev) =>
      prev.map((t) => (t.filePath === filePath ? { ...t, ...patch } : t)),
    );
  }, []);

  const pollOcrStatus = useCallback((fileId: string, filePath: string) => {
    const existing = pollingMapRef.current.get(fileId);
    if (existing) clearInterval(existing);

    let attempts = 0;
    const maxAttempts = 60;

    const timer = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(timer);
        pollingMapRef.current.delete(fileId);
        updateTask(filePath, { step: 'ocr_failed' });
        Taro.showToast({ title: '识别超时，请重试', icon: 'none' });
        return;
      }

      try {
        const res = await fileApi.getOcrStatus(fileId);
        const ocrStatus = res.ocr_status;

        if (ocrStatus === 'done') {
          clearInterval(timer);
          pollingMapRef.current.delete(fileId);
          const records = res.records || [];
          if (records.length > 0) {
            const record = records[0];
            updateTask(filePath, {
              step: 'ocr_done',
              recordId: record.id,
              recordData: record,
            });
            const encodedData = encodeURIComponent(JSON.stringify(record));
            Taro.navigateTo({
              url: `/pages/result/index?id=${record.id}&data=${encodedData}`,
            });
          } else {
            updateTask(filePath, { step: 'ocr_done' });
            Taro.showToast({ title: '识别完成，但未提取到记录', icon: 'none' });
          }
        } else if (ocrStatus === 'failed') {
          clearInterval(timer);
          pollingMapRef.current.delete(fileId);
          updateTask(filePath, { step: 'ocr_failed' });
          Taro.showToast({ title: '识别失败，请重试', icon: 'none' });
        }
      } catch {
        clearInterval(timer);
        pollingMapRef.current.delete(fileId);
        updateTask(filePath, { step: 'ocr_failed' });
        Taro.showToast({ title: '识别异常，请重试', icon: 'none' });
      }
    }, 2000);

    pollingMapRef.current.set(fileId, timer);
  }, [updateTask]);

  const getProjectId = (): string | null => {
    if (currentProject) return currentProject.id;
    const params = Taro.getCurrentInstance().router?.params;
    if (params?.projectId) return params.projectId;
    if (projects.length > 0) return projects[0].id;
    return null;
  };

  const processFile = useCallback(async (filePath: string) => {
    const projectId = getProjectId();
    if (!projectId) {
      Taro.showToast({ title: '请先选择项目', icon: 'none' });
      return;
    }

    const task: UploadTask = { filePath, step: 'uploading', progress: 0 };
    setTasks((prev) => [...prev, task]);

    try {
      updateTask(filePath, { progress: 20 });
      const uploadRes = await fileApi.upload(filePath, projectId);
      const fileId = uploadRes.file_id;

      if (!fileId) throw new Error('上传返回无效');

      updateTask(filePath, { progress: 50, fileId, contentKind: uploadRes.content_kind });

      // 数电票 XML 在后端上传接口里**同步**解析（不走 Celery），所以上传返回时
      // 结果就已经定了，再去轮询 OCR 状态只会一直等到超时。
      if (uploadRes.content_kind !== 'image') {
        if (uploadRes.quota_exceeded) {
          updateTask(filePath, { step: 'ocr_failed' });
          Taro.showToast({ title: '本月识别额度已用完，文件已归档', icon: 'none' });
          return;
        }
        if (uploadRes.content_kind === 'ofd') {
          // OFD 后端只做归档、不做解析（当前没有 OFD 解析实现）。
          // 不写成「识别失败」——文件确实已存下来，措辞必须与事实一致。
          updateTask(filePath, { step: 'archived', progress: 100 });
          Taro.showToast({ title: 'OFD 原件已归档，暂不支持自动解析', icon: 'none' });
          return;
        }
        if (uploadRes.parse_status !== 'done') {
          updateTask(filePath, { step: 'ocr_failed' });
          Taro.showToast({
            title: uploadRes.message || '文件已归档，但未解析出票据信息',
            icon: 'none',
          });
          return;
        }
        updateTask(filePath, { step: 'ocr_done', progress: 100 });
        const statusRes = await fileApi.getOcrStatus(fileId);
        const rec = (statusRes.records || [])[0];
        if (rec) {
          updateTask(filePath, { step: 'ocr_done', recordId: rec.id, recordData: rec });
          // 只带 id：结果页会自己拉详情，拿得到查重命中与票面自检
          Taro.navigateTo({ url: `/pages/result/index?id=${rec.id}` });
        } else {
          Taro.showToast({ title: '文件已归档，未解析出票据信息', icon: 'none' });
        }
        return;
      }

      await fileApi.triggerOcr(fileId);
      updateTask(filePath, { step: 'ocr_processing', progress: 70 });
      pollOcrStatus(fileId, filePath);
    } catch (error: any) {
      updateTask(filePath, { step: 'ocr_failed' });
      Taro.showToast({ title: error.message || '上传失败', icon: 'none' });
    }
  }, [currentProject, projects, updateTask, pollOcrStatus]);

/**
 * 选图被用户取消是高频操作，不是错误。不写 fail 回调时微信会走全局 fail，
 * 在控制台留下一条「chooseImage:fail cancel」的未处理 Promise 异常，干扰排错。
 * 这里显式吞掉 cancel，其余失败才提示。
 */
const onChooseImageCancelSafe = (err?: { errMsg?: string }) => {
  if (err?.errMsg?.includes('cancel')) return;
  Taro.showToast({ title: '选择图片失败，请重试', icon: 'none' });
};

  const handleCamera = () => {
    if (!getProjectId()) {
      Taro.showToast({ title: '请先选择项目', icon: 'none' });
      return;
    }
    Taro.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['camera'],
      success: (res) => processFile(res.tempFilePaths[0]),
      fail: onChooseImageCancelSafe,
    });
  };

  const handleAlbum = () => {
    if (!getProjectId()) {
      Taro.showToast({ title: '请先选择项目', icon: 'none' });
      return;
    }
    Taro.chooseImage({
      count: 9,
      sizeType: ['compressed'],
      sourceType: ['album'],
      success: (res) => res.tempFilePaths.forEach((path) => processFile(path)),
      fail: onChooseImageCancelSafe,
    });
  };

  /**
   * 选数电票原件（XML / OFD）。
   *
   * 只能用 chooseMessageFile：微信小程序拿不到系统文件浏览器，只能从聊天记录里
   * 选文件。所以提示语里要写清「先把文件发到任意聊天里」，否则用户会找不到入口。
   */
  const handleMessageFile = () => {
    if (!getProjectId()) {
      Taro.showToast({ title: '请先选择项目', icon: 'none' });
      return;
    }
    if (typeof Taro.chooseMessageFile !== 'function') {
      Taro.showToast({ title: '当前环境不支持选择文件', icon: 'none' });
      return;
    }
    Taro.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['xml', 'ofd'],
      success: (res) => {
        const picked = res.tempFiles?.[0];
        if (picked?.path) processFile(picked.path);
      },
    });
  };

  const handleProjectChange = (e) => {
    const idx = Number(e.detail.value);
    if (idx >= 0 && idx < projects.length) setCurrentProject(projects[idx]);
  };

  const getStepText = (step: UploadStep): string => {
    switch (step) {
      case 'uploading': return '上传中...';
      case 'ocr_processing': return '识别中...';
      case 'archived': return '原件已归档';
      case 'ocr_done': return '识别完成';
      case 'ocr_failed': return '识别失败';
      default: return '';
    }
  };

  const getStepPercent = (task: UploadTask): number => {
    switch (task.step) {
      case 'uploading': return task.progress;
      case 'ocr_processing': return 70;
      case 'archived': return 100;
      case 'ocr_done': return 100;
      case 'ocr_failed': return task.progress;
      default: return 0;
    }
  };

  const isProcessing = tasks.some((t) => t.step === 'uploading' || t.step === 'ocr_processing');

  return (
    <View className='upload-page'>
      <View className='project-selector'>
        <Text className='selector-label'>归属项目</Text>
        <Picker
          mode='selector'
          range={projects.map((p) => p.name)}
          value={selectedProjectIndex >= 0 ? selectedProjectIndex : 0}
          onChange={handleProjectChange}
        >
          <View className='selector-value'>
            <Text className={currentProject ? 'selector-text' : 'selector-text placeholder'}>
              {currentProject ? currentProject.name : '请选择项目'}
            </Text>
            <Text className='selector-arrow'>▸</Text>
          </View>
        </Picker>
      </View>

      <View className='upload-area'>
        <View className='upload-icon-wrap'>
          <Text className='upload-icon'>📋</Text>
        </View>
        <Text className='upload-title'>上传票据</Text>
        <Text className='upload-desc'>支持增值税发票、火车票、出租车票等</Text>

        <View className='upload-actions'>
          <View
            className={`action-btn camera-btn ${isProcessing ? 'disabled' : ''}`}
            onClick={isProcessing ? undefined : handleCamera}
          >
            <Text className='action-icon'>📷</Text>
            <Text className='action-label'>拍照识别</Text>
          </View>
          <View
            className={`action-btn album-btn ${isProcessing ? 'disabled' : ''}`}
            onClick={isProcessing ? undefined : handleAlbum}
          >
            <Text className='action-icon'>🖼️</Text>
            <Text className='action-label'>相册选择</Text>
          </View>
        </View>

        <View
          className={`action-btn doc-btn ${isProcessing ? 'disabled' : ''}`}
          onClick={isProcessing ? undefined : handleMessageFile}
        >
          <Text className='action-icon'>📄</Text>
          <Text className='action-label'>数电票原件（XML / OFD）</Text>
        </View>
      </View>

      {tasks.length > 0 && (
        <View className='task-list'>
          <Text className='task-list-title'>上传记录</Text>
          {tasks.map((task, idx) => (
            <View className='task-item' key={`${task.filePath}-${idx}`}>
              {task.contentKind && task.contentKind !== 'image' ? (
                // 文档类没有可渲染的缩略图，用图标占位，避免 Image 组件加载失败留白
                <View className='task-thumb task-thumb--doc'>
                  <Text className='task-thumb-icon'>📄</Text>
                </View>
              ) : (
                <Image className='task-thumb' src={task.filePath} mode='aspectFill' />
              )}
              <View className='task-info'>
                <Text className='task-status'>{getStepText(task.step)}</Text>
                {(task.step === 'uploading' || task.step === 'ocr_processing') && (
                  <Progress
                    percent={getStepPercent(task)}
                    strokeWidth={4}
                    activeColor='#FF6B35'
                    backgroundColor='#EEEEEE'
                  />
                )}
                {task.step === 'ocr_done' && (
                  <Text className='task-done-text'>点击查看结果</Text>
                )}
                {task.step === 'archived' && (
                  <Text className='task-done-text'>原件已保存，可手工补录</Text>
                )}
                {task.step === 'ocr_failed' && (
                  <Text className='task-fail-text'>请重新上传</Text>
                )}
              </View>
              {task.step === 'ocr_done' && task.recordId && (
                <View
                  className='task-goto'
                  onClick={() => {
                    const encodedData = task.recordData
                      ? encodeURIComponent(JSON.stringify(task.recordData))
                      : '';
                    Taro.navigateTo({
                      url: `/pages/result/index?id=${task.recordId}&data=${encodedData}`,
                    });
                  }}
                >
                  <Text className='task-goto-text'>查看</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      <View className='upload-tips'>
        <Text className='tips-title'>温馨提示</Text>
        <Text className='tip-item'>• 请确保票据清晰完整，避免模糊或遮挡</Text>
        <Text className='tip-item'>• 图片支持 JPG、PNG 格式，单张不超过 10MB</Text>
        <Text className='tip-item'>• 数电票原件支持 XML（不超过 5MB）与 OFD（不超过 20MB）</Text>
        <Text className='tip-item'>• 选数电票原件需先从聊天记录中选取，可先转发到任意聊天</Text>
        <Text className='tip-item'>• 相册选择最多支持 9 张图片</Text>
        <Text className='tip-item'>• 识别结果可在历史记录中查看和修改</Text>
      </View>
    </View>
  );
}
