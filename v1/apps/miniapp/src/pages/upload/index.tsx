import { View, Text, Button, Picker, Progress } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState } from 'react';
import { invoiceApi, projectApi } from '../../services/api';
import { useStore } from '../../store';
import './index.scss';

interface ProjectOption {
  id: string;
  name: string;
}

export default function Upload() {
  const { projects, fetchProjects } = useStore();
  const [selectedProject, setSelectedProject] = useState<number>(0);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [projectList, setProjectList] = useState<ProjectOption[]>([]);

  Taro.useDidShow(() => {
    fetchProjects().then(() => {
      const list = useStore.getState().projects.map((p) => ({
        id: p.id,
        name: p.name,
      }));
      setProjectList(list);
    });
  });

  const handleCamera = () => {
    Taro.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['camera'],
      success: (res) => {
        uploadFile(res.tempFilePaths[0]);
      },
    });
  };

  const handleAlbum = () => {
    Taro.chooseImage({
      count: 9,
      sizeType: ['compressed'],
      sourceType: ['album'],
      success: (res) => {
        res.tempFilePaths.forEach((path) => {
          uploadFile(path);
        });
      },
    });
  };

  const uploadFile = async (filePath: string) => {
    setUploading(true);
    setProgress(0);

    try {
      const projectId = projectList[selectedProject]?.id;
      const result = await invoiceApi.upload(filePath, projectId);

      setProgress(100);
      Taro.showToast({ title: '上传成功', icon: 'success' });

      setTimeout(() => {
        Taro.navigateTo({
          url: `/pages/result/index?id=${result.data.id}`,
        });
      }, 1000);
    } catch (error: any) {
      Taro.showToast({ title: error.message || '上传失败', icon: 'none' });
    } finally {
      setUploading(false);
    }
  };

  const onProjectChange = (e) => {
    setSelectedProject(Number(e.detail.value));
  };

  return (
    <View className='upload-page'>
      <View className='upload-area'>
        <View className='upload-icon-wrap'>
          <Text className='upload-icon'>📄</Text>
        </View>
        <Text className='upload-title'>上传票据</Text>
        <Text className='upload-desc'>支持增值税发票、火车票、出租车票等</Text>

        <View className='upload-actions'>
          <Button className='action-btn camera-btn' onClick={handleCamera} disabled={uploading}>
            <Text className='action-icon'>📷</Text>
            <Text className='action-label'>拍照上传</Text>
          </Button>
          <Button className='action-btn album-btn' onClick={handleAlbum} disabled={uploading}>
            <Text className='action-icon'>🖼️</Text>
            <Text className='action-label'>相册选择</Text>
          </Button>
        </View>
      </View>

      {uploading && (
        <View className='progress-section'>
          <Text className='progress-text'>正在识别中...</Text>
          <Progress
            percent={progress}
            strokeWidth={8}
            activeColor='#FF6B35'
            backgroundColor='#EEEEEE'
          />
        </View>
      )}

      <View className='project-selector'>
        <Text className='selector-label'>归属项目</Text>
        <Picker
          mode='selector'
          range={projectList.map((p) => p.name)}
          value={selectedProject}
          onChange={onProjectChange}
        >
          <View className='selector-value'>
            <Text>
              {projectList.length > 0
                ? projectList[selectedProject]?.name || '请选择项目'
                : '暂无项目，请先创建'}
            </Text>
            <Text className='selector-arrow'>›</Text>
          </View>
        </Picker>
      </View>

      <View className='upload-tips'>
        <Text className='tips-title'>温馨提示</Text>
        <Text className='tip-item'>• 请确保票据清晰完整，避免模糊或遮挡</Text>
        <Text className='tip-item'>• 支持 JPG、PNG 格式，单张不超过 10MB</Text>
        <Text className='tip-item'>• 批量上传最多支持 9 张图片</Text>
        <Text className='tip-item'>• 识别结果可在历史记录中查看和修改</Text>
      </View>
    </View>
  );
}
