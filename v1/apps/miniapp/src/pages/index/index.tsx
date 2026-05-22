import { View, Text, Button, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useStore } from '../../store';
import QuotaCard from '../../components/QuotaCard';
import './index.scss';

export default function Index() {
  const { quota, projects, userInfo } = useStore();

  const handleUpload = () => {
    Taro.navigateTo({ url: '/pages/upload/index' });
  };

  const handleProjectClick = (id: string) => {
    Taro.navigateTo({ url: `/pages/project/index?id=${id}` });
  };

  const handleMemberClick = () => {
    Taro.navigateTo({ url: '/pages/member/index' });
  };

  const handleViewAllProjects = () => {
    Taro.switchTab({ url: '/pages/toolkit/index' });
  };

  return (
    <View className='index-page'>
      <View className='index-header'>
        <View className='greeting'>
          <Text className='greeting-text'>你好，{userInfo?.nickname || '用户'}</Text>
          <Text className='greeting-sub'>今天需要识别票据吗？</Text>
        </View>
        <Image
          className='avatar'
          src={userInfo?.avatar || 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI9FhqR6no4pKIrgIbEDk0YqIjYzS7JNibb2nZcTiaS6xFupbGBy1QcBcQ2Q'
          }
          mode='aspectFill'
        />
      </View>

      <QuotaCard
        remaining={quota?.remaining ?? 0}
        total={quota?.total ?? 10}
        plan={quota?.plan || '免费版'}
        onUpgrade={handleMemberClick}
      />

      <View className='quick-actions'>
        <Button className='upload-btn' onClick={handleUpload}>
          <Text className='upload-icon'>📷</Text>
          <Text className='upload-text'>拍照识别</Text>
        </Button>
      </View>

      <View className='section'>
        <View className='section-header'>
          <Text className='section-title'>最近项目</Text>
          <Text className='section-more' onClick={handleViewAllProjects}>查看全部</Text>
        </View>

        {projects.length > 0 ? (
          <View className='project-list'>
            {projects.slice(0, 3).map((project) => (
              <View
                key={project.id}
                className='project-item'
                onClick={() => handleProjectClick(project.id)}
              >
                <View className='project-info'>
                  <Text className='project-name'>{project.name}</Text>
                  <Text className='project-meta'>
                    {project.recordCount} 条记录 · 成本 ¥{project.totalCost.toFixed(2)}
                  </Text>
                </View>
                <Text className='project-arrow'>›</Text>
              </View>
            ))}
          </View>
        ) : (
          <View className='empty-state'>
            <Text className='empty-text'>暂无项目，快去创建一个吧</Text>
          </View>
        )}
      </View>

      <View className='member-entry' onClick={handleMemberClick}>
        <View className='member-info'>
          <Text className='member-icon'>👑</Text>
          <View className='member-text'>
            <Text className='member-title'>升级会员</Text>
            <Text className='member-desc'>解锁更多识别次数和高级功能</Text>
          </View>
        </View>
        <Text className='member-arrow'>›</Text>
      </View>
    </View>
  );
}
