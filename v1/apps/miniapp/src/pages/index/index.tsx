import { View, Text } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useState } from 'react';
import { projectApi } from '../../services/api';
import { useStore } from '../../store';
import './index.scss';

export default function Index() {
  const userInfo = useStore((s) => s.userInfo);
  const quota = useStore((s) => s.quota);
  const projects = useStore((s) => s.projects);
  const fetchUserInfo = useStore((s) => s.fetchUserInfo);
  const fetchQuota = useStore((s) => s.fetchQuota);
  const fetchProjects = useStore((s) => s.fetchProjects);
  const [creating, setCreating] = useState(false);

  useDidShow(() => {
    fetchUserInfo();
    fetchQuota();
    fetchProjects();
  });

  const quotaUsed = quota?.quota_used ?? 0;
  const quotaTotal = quota?.quota_total ?? 0;
  const quotaPercent = quotaTotal > 0 ? Math.min((quotaUsed / quotaTotal) * 100, 100) : 0;
  const isLow = quotaTotal > 0 && (quotaUsed / quotaTotal) >= 80;

  const ensureProject = async (): Promise<string | null> => {
    if (projects.length > 0) return projects[0].id;
    if (creating) return null;
    setCreating(true);
    try {
      const res = await projectApi.create({
        name: '我的餐饮项目',
        industry: '餐饮',
      });
      await fetchProjects();
      return (res as any).id;
    } catch {
      Taro.showToast({ title: '创建项目失败', icon: 'none' });
      return null;
    } finally {
      setCreating(false);
    }
  };

  const handleUpload = async () => {
    const projectId = await ensureProject();
    if (projectId) {
      Taro.navigateTo({ url: `/pages/upload/index?projectId=${projectId}` });
    }
  };

  const handleManual = async () => {
    const projectId = await ensureProject();
    if (projectId) {
      Taro.navigateTo({ url: `/pages/result/index?mode=manual&projectId=${projectId}` });
    }
  };

  const handleProjectClick = (id: string) => {
    Taro.navigateTo({ url: `/pages/project/index?id=${id}` });
  };

  const handleMemberClick = () => {
    Taro.navigateTo({ url: '/pages/member/index' });
  };

  const handleCreateProject = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const res = await projectApi.create({
        name: '新项目',
        industry: '餐饮',
      });
      await fetchProjects();
      const projectId = (res as any).id;
      if (projectId) {
        Taro.navigateTo({ url: `/pages/project/index?id=${projectId}` });
      }
    } catch {
      Taro.showToast({ title: '创建失败', icon: 'none' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <View className='index-page'>
      <View className='index-header'>
        <View className='greeting'>
          <Text className='greeting-text'>你好，{userInfo?.nickname || '用户'}</Text>
          <Text className='greeting-sub'>今天需要识别票据吗？</Text>
        </View>
      </View>

      <View className='quota-card' onClick={handleMemberClick}>
        <View className='quota-header'>
          <Text className='quota-plan'>{quota?.plan_name || '免费版'}</Text>
          <Text className='quota-upgrade'>会员中心 ›</Text>
        </View>
        <View className='quota-body'>
          <Text className='quota-used'>{quotaUsed}</Text>
          <Text className='quota-total'> / {quotaTotal === -1 ? '∞' : quotaTotal} 次</Text>
        </View>
        <Text className='quota-label'>本月已使用识别次数</Text>
        <View className='quota-track'>
          <View
            className={`quota-fill ${isLow ? 'low' : ''}`}
            style={{ width: `${quotaPercent}%` }}
          />
        </View>
        {isLow && (
          <Text className='quota-warning'>识别次数即将用尽，请升级会员</Text>
        )}
      </View>

      <View className='quick-actions'>
        <View className='action-btn upload-btn' onClick={handleUpload}>
          <Text className='action-icon'>📷</Text>
          <Text className='action-text'>拍照识别</Text>
        </View>
        <View className='action-btn manual-btn' onClick={handleManual}>
          <Text className='action-icon'>✏️</Text>
          <Text className='action-text'>手动录入</Text>
        </View>
      </View>

      <View className='section'>
        <View className='section-header'>
          <Text className='section-title'>最近项目</Text>
          <Text className='create-link' onClick={handleCreateProject}>+ 新建</Text>
        </View>

        {projects.length > 0 ? (
          <View className='project-list'>
            {projects.slice(0, 5).map((project) => (
              <View
                key={project.id}
                className='project-card'
                onClick={() => handleProjectClick(project.id)}
              >
                <View className='project-main'>
                  <Text className='project-name'>{project.name}</Text>
                  <View className='project-tags'>
                    {project.industry ? (
                      <Text className='project-tag'>{project.industry}</Text>
                    ) : null}
                    <Text className='project-meta'>{project.record_count || 0} 条记录</Text>
                  </View>
                </View>
                <View className='project-cost'>
                  <Text className='cost-label'>成本</Text>
                  <Text className='cost-value'>¥{Number(project.total_cost || 0).toFixed(2)}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View className='empty-state'>
            <Text className='empty-icon'>📋</Text>
            <Text className='empty-text'>暂无项目，点击上方按钮开始</Text>
          </View>
        )}
      </View>

      <View className='member-entry' onClick={handleMemberClick}>
        <View className='member-info'>
          <Text className='member-icon'>👑</Text>
          <View className='member-text'>
            <Text className='member-title'>会员中心</Text>
            <Text className='member-desc'>解锁更多识别次数和高级功能</Text>
          </View>
        </View>
        <Text className='member-arrow'>›</Text>
      </View>
    </View>
  );
}
