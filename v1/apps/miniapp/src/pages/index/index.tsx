import { View, Text } from '@tarojs/components';
import { requireLogin } from '../../utils/authGate';
import Taro, { useDidShow, useShareAppMessage } from '@tarojs/taro';
import { useState } from 'react';
import { pointsApi, projectApi } from '../../services/api';
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
  const [checkedInToday, setCheckedInToday] = useState<boolean | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);

  const loadPointsStatus = async () => {
    try {
      const res = await pointsApi.getPoints();
      setCheckedInToday(res.checked_in_today);
    } catch {
      // 忽略：签到状态拿不到不影响首页其它内容
    }
  };

  const handleCheckin = async () => {
    if (checkingIn || checkedInToday) return;
    // 签到要记到账号上，必须先有正式登录（绑定手机号）
    if (!(await requireLogin())) return;
    setCheckingIn(true);
    try {
      const res = await pointsApi.checkin();
      setCheckedInToday(true);
      fetchQuota();
      Taro.showToast({ title: res.message || '签到成功', icon: 'success' });
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '签到失败', icon: 'none' });
      loadPointsStatus();
    } finally {
      setCheckingIn(false);
    }
  };

  useDidShow(() => {
    fetchUserInfo();
    fetchQuota();
    fetchProjects();
    loadPointsStatus();
  });

  // 小程序内转发：拉新最直接的路径，个人主体可正常使用（不依赖任何后端与域名）。
  useShareAppMessage(() => ({
    title: 'AI票小助 · 票据拍一张，自动识别归类',
    path: '/pages/index/index',
  }));

  // 计量单位改为积分：余额越低越该提示（阈值按一次 AI 分析的成本估）
  const pointsBalance = quota?.points_balance ?? 0;
  const isLow = quota ? pointsBalance < (quota.points_cost_ai ?? 10) : false;

  const ensureProject = async (): Promise<string | null> => {
    if (projects.length > 0) return projects[0].id;
    if (creating) return null;
    if (!useStore.getState().isLoggedIn()) {
      Taro.showToast({ title: '请先登录', icon: 'none' });
      return null;
    }
    setCreating(true);
    try {
      const res = await projectApi.create({
        name: '我的餐饮项目',
        industry: '餐饮',
      });
      await fetchProjects();
      return (res as any).id;
    } catch (err: any) {
      // 透出后端原因（未登录 / 项目数已达上限 / 网络异常），否则无从排查
      Taro.showToast({ title: err?.message || '创建项目失败', icon: 'none' });
      return null;
    } finally {
      setCreating(false);
    }
  };

  const handleUpload = async () => {
    if (!(await requireLogin())) return;
    const projectId = await ensureProject();
    if (projectId) {
      Taro.navigateTo({ url: `/pages/upload/index?projectId=${projectId}` });
    }
  };

  const handleQuickEntry = async () => {
    if (!(await requireLogin())) return;
    const projectId = await ensureProject();
    if (projectId) {
      Taro.navigateTo({ url: `/pages/quick-entry/index?projectId=${projectId}` });
    }
  };

  const handleManual = async () => {
    if (!(await requireLogin())) return;
    const projectId = await ensureProject();
    if (projectId) {
      Taro.navigateTo({ url: `/pages/result/index?mode=manual&projectId=${projectId}` });
    }
  };

  const handleProjectClick = (id: string) => {
    Taro.navigateTo({ url: `/pages/project/index?id=${id}` });
  };

  /** 跳到需要 projectId 的页面；没有项目时先提示，避免跳过去空白 */
  const goProjectPage = (name: 'analysis' | 'report') => {
    const pid = projects[0]?.id;
    if (!pid) {
      Taro.showToast({ title: '请先创建一个项目', icon: 'none' });
      return;
    }
    Taro.navigateTo({ url: `/pages/${name}/index?projectId=${pid}` });
  };

  const handleMemberClick = () => {
    Taro.navigateTo({ url: '/pages/member/index' });
  };

  const handleCreateProject = async () => {
    if (creating) return;
    if (!useStore.getState().isLoggedIn()) {
      Taro.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
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
    } catch (err: any) {
      Taro.showToast({ title: err?.message || '创建项目失败', icon: 'none' });
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
        <View
          className={`checkin-pill ${checkedInToday ? 'checkin-pill--done' : ''}`}
          onClick={handleCheckin}
        >
          <Text className='checkin-text'>
            {checkedInToday ? '已签到 ✓' : checkingIn ? '签到中…' : '签到 +2'}
          </Text>
        </View>
      </View>

      {/* 主 CTA：把最高频的动作做成整块大按钮，而不是和其他入口并列的小方块 */}
      <View className='hero-upload' onClick={handleUpload}>
        <Text className='hero-icon'>📷</Text>
        <View className='hero-main'>
          <Text className='hero-title'>上传票据</Text>
          <Text className='hero-desc'>拍照即记账，AI 自动识别金额与分类</Text>
        </View>
        <Text className='hero-cta'>去上传 ›</Text>
      </View>

      <View className='points-strip' onClick={handleMemberClick}>
        <Text className='strip-text'>
          <Text className='strip-num'>{pointsBalance}</Text> 积分
          {quota ? ` · 本月已用 ${quota.points_used_this_month} 分` : ''}
        </Text>
        <Text className='strip-link'>会员中心 ›</Text>
      </View>
      {isLow && (
        <Text className='points-warning'>积分不足一次 AI 分析，签到或购买套餐可补充</Text>
      )}

      <View className='quick-grid'>
        <View className='quick-item' onClick={handleQuickEntry}>
          <Text className='quick-icon'>💬</Text>
          <Text className='quick-text'>说一句记账</Text>
        </View>
        <View className='quick-item' onClick={handleManual}>
          <Text className='quick-icon'>✏️</Text>
          <Text className='quick-text'>手动录入</Text>
        </View>
        <View className='quick-item' onClick={() => goProjectPage('analysis')}>
          <Text className='quick-icon'>✨</Text>
          <Text className='quick-text'>AI 分析</Text>
        </View>
        <View className='quick-item' onClick={() => goProjectPage('report')}>
          <Text className='quick-icon'>📊</Text>
          <Text className='quick-text'>报表</Text>
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
