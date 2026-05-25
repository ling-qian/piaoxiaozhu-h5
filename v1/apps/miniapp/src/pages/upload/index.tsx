import { View, Text, Image, Picker, Progress } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState, useRef, useCallback } from 'react';
import { fileApi } from '../../services/api';
import { useStore } from '../../store';
import './index.scss';

type UploadStep = 'idle' | 'uploading' | 'ocr_processing' | 'ocr_done' | 'ocr_failed';

interface UploadTask {
  filePath: string;
  step: UploadStep;
  progress: number;
  fileId?: string;
  recordId?: string;
  recordData?: any;
}

export default function Upload() {
  const { projects, currentProject, fetchProjects, setCurrentProject } = useStore();
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  Taro.useDidShow(() => {
    fetchProjects();
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
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    let attempts = 0;
    const maxAttempts = 60;

    pollingRef.current = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        if (pollingRef.current) clearInterval(pollingRef.current);
        updateTask(filePath, { step: 'ocr_failed' });
        Taro.showToast({ title: '识别超时，请重试', icon: 'none' });
        return;
      }

      try {
        const res = await fileApi.getOcrStatus(fileId);
        const ocrStatus = res.ocr_status;

        if (ocrStatus === 'done') {
          if (pollingRef.current) clearInterval(pollingRef.current);
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
          if (pollingRef.current) clearInterval(pollingRef.current);
          updateTask(filePath, { step: 'ocr_failed' });
          Taro.showToast({ title: '识别失败，请重试', icon: 'none' });
        }
      } catch {
        if (pollingRef.current) clearInterval(pollingRef.current);
        updateTask(filePath, { step: 'ocr_failed' });
        Taro.showToast({ title: '识别异常，请重试', icon: 'none' });
      }
    }, 2000);
  }, [updateTask]);

  const processFile = useCallback(async (filePath: string) => {
    if (!currentProject) {
      Taro.showToast({ title: '请先选择项目', icon: 'none' });
      return;
    }

    const task: UploadTask = { filePath, step: 'uploading', progress: 0 };
    setTasks((prev) => [...prev, task]);

    try {
      updateTask(filePath, { progress: 20 });
      const uploadRes = await fileApi.upload(filePath, currentProject.id);
      const fileId = uploadRes.file_id;

      if (!fileId) {
        throw new Error('上传返回无效');
      }

      updateTask(filePath, { progress: 50, fileId });

      await fileApi.triggerOcr(fileId);

      updateTask(filePath, { step: 'ocr_processing', progress: 70 });

      pollOcrStatus(fileId, filePath);
    } catch (error: any) {
      updateTask(filePath, { step: 'ocr_failed' });
      Taro.showToast({ title: error.message || '上传失败', icon: 'none' });
    }
  }, [currentProject, updateTask, pollOcrStatus]);

  const handleCamera = () => {
    if (!currentProject) {
      Taro.showToast({ title: '请先选择项目', icon: 'none' });
      return;
    }
    Taro.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['camera'],
      success: (res) => {
        processFile(res.tempFilePaths[0]);
      },
    });
  };

  const handleAlbum = () => {
    if (!currentProject) {
      Taro.showToast({ title: '请先选择项目', icon: 'none' });
      return;
    }
    Taro.chooseImage({
      count: 9,
      sizeType: ['compressed'],
      sourceType: ['album'],
      success: (res) => {
        res.tempFilePaths.forEach((path) => processFile(path));
      },
    });
  };

  const handleProjectChange = (e) => {
    const idx = Number(e.detail.value);
    if (idx >= 0 && idx < projects.length) {
      setCurrentProject(projects[idx]);
    }
  };

  const getStepText = (step: UploadStep): string => {
    switch (step) {
      case 'uploading': return '上传中...';
      case 'ocr_processing': return '识别中...';
      case 'ocr_done': return '识别完成';
      case 'ocr_failed': return '识别失败';
      default: return '';
    }
  };

  const getStepPercent = (task: UploadTask): number => {
    switch (task.step) {
      case 'uploading': return task.progress;
      case 'ocr_processing': return 70;
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
      </View>

      {tasks.length > 0 && (
        <View className='task-list'>
          <Text className='task-list-title'>上传记录</Text>
          {tasks.map((task, idx) => (
            <View className='task-item' key={`${task.filePath}-${idx}`}>
              <Image className='task-thumb' src={task.filePath} mode='aspectFill' />
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
        <Text className='tip-item'>• 支持 JPG、PNG 格式，单张不超过 10MB</Text>
        <Text className='tip-item'>• 相册选择最多支持 9 张图片</Text>
        <Text className='tip-item'>• 识别结果可在历史记录中查看和修改</Text>
      </View>
    </View>
  );
}
