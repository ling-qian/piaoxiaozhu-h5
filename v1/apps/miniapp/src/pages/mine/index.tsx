import { View, Text, Button, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState } from 'react';
import { useStore } from '../../store';
import { pointsApi, resolveMediaUrl, userApi } from '../../services/api';
import './index.scss';

const PLAN_NAMES: Record<string, string> = {
  free: '免费版',
  pro: '专业版',
  enterprise: '企业版',
};

const DEFAULT_AVATAR = 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI9FhqR6no4pKIrgIbEDk0YqIjYzS7JNibb2nZcTiaS6xFupbGBy1QcBcQ2Q';

export default function Mine() {
  const { userInfo, quota, logout, fetchUserInfo, fetchQuota } = useStore();

  const [points, setPoints] = useState<{ balance: number; checked_in_today: boolean } | null>(null);
  const [checkingIn, setCheckingIn] = useState(false);

  const loadPoints = async () => {
    try {
      const res = await pointsApi.getPoints();
      setPoints({ balance: res.balance, checked_in_today: res.checked_in_today });
    } catch {
      // 积分加载失败不影响页面其它部分
    }
  };

  const handleCheckin = async () => {
    if (checkingIn) return;
    setCheckingIn(true);
    try {
      const res = await pointsApi.checkin();
      setPoints({ balance: res.balance, checked_in_today: true });
      Taro.showToast({ title: res.message || '签到成功', icon: 'success' });
    } catch (e: any) {
      // 后端对重复签到返回 400，按其文案提示即可
      Taro.showToast({ title: e?.message || '签到失败', icon: 'none' });
      await loadPoints();
    } finally {
      setCheckingIn(false);
    }
  };

  Taro.useDidShow(() => {
    if (userInfo) {
      // 资料页可能刚改过昵称/头像，回到本页要拿最新的
      fetchUserInfo();
      fetchQuota();
      loadPoints();
    }
  });

  const planName = userInfo?.plan_code
    ? PLAN_NAMES[userInfo.plan_code] || userInfo.plan_code
    : '免费版';

  /**
   * 登录 = 拿到微信身份（静默，如有必要）+ 用户主动授权手机号。
   * 点击后跳到授权登录页（仿大众点评），手机号授权完成才算登录成功。
   */
  const handleLogin = async () => {
    // 先确保有 token（静默登录失败过的用户在这里兜底），否则授权页调 bind-phone 会 401
    if (!useStore.getState().token) {
      try {
        const res = await Taro.login();
        if (!res.code) {
          Taro.showToast({ title: '未获取到微信登录凭证', icon: 'none' });
          return;
        }
        await useStore.getState().login(res.code);
      } catch {
        Taro.showToast({ title: '微信登录失败，请重试', icon: 'none' });
        return;
      }
    }
    Taro.navigateTo({ url: '/pages/phone-bind/index' });
  };

  const handleLogout = () => {
    Taro.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          logout();
          Taro.showToast({ title: '已退出登录', icon: 'success' });
        }
      },
    });
  };

  const handleMenuClick = (action: string) => {
    switch (action) {
      case 'member':
        Taro.navigateTo({ url: '/pages/member/index' });
        break;
      case 'quota':
        showQuotaInfo();
        break;
      case 'toolkit':
        Taro.navigateTo({ url: '/pages/toolkit/index' });
        break;
      case 'profile':
        Taro.navigateTo({ url: '/pages/profile/index' });
        break;
      case 'privacy':
        Taro.navigateTo({ url: '/pages/privacy/index' });
        break;
      case 'about':
        showAboutInfo();
        break;
      default:
        break;
    }
  };

  const handleDeleteAccount = () => {
    Taro.showModal({
      title: '注销账号',
      content: '注销后，您的项目、票据、报表等全部数据将被永久删除且无法恢复，确定继续吗？',
      confirmText: '继续注销',
      confirmColor: '#FF4D4F',
      success: (res) => {
        if (!res.confirm) return;
        // 二次确认，避免误触；这是不可逆操作
        Taro.showModal({
          title: '再次确认',
          content: '删除后无法找回，也没有备份。确认注销账号？',
          confirmText: '确认注销',
          confirmColor: '#FF4D4F',
          success: async (res2) => {
            if (!res2.confirm) return;
            try {
              await userApi.deleteAccount();
              logout();
              Taro.reLaunch({ url: '/pages/index/index' });
            } catch (err: any) {
              Taro.showToast({ title: err?.message || '注销失败', icon: 'none' });
            }
          },
        });
      },
    });
  };

  const showQuotaInfo = () => {
    if (!quota) {
      Taro.showToast({ title: '暂无积分信息', icon: 'none' });
      return;
    }
    Taro.showModal({
      title: '积分说明',
      content:
        `当前余额：${quota.points_balance} 分\n` +
        `本月已用：${quota.points_used_this_month} 分\n` +
        `套餐月发放：${quota.points_per_month > 0 ? `${quota.points_per_month} 分` : '无（免费版）'}\n\n` +
        `消耗：识别 1 张票 ${quota.points_cost_ocr} 分，AI 分析 ${quota.points_cost_ai} 分/次\n` +
        `获取：注册赠送、每日签到 +2、购买套餐`,
      showCancel: false,
      confirmText: '知道了',
    });
  };

  const showAboutInfo = () => {
    Taro.showModal({
      title: '关于AI票小助',
      content: 'AI票小助 - 智能票据管理助手\n版本：1.0.0\n为您提供便捷的票据识别、分类和管理服务，助力小微商户轻松管票据。',
      showCancel: false,
      confirmText: '知道了',
    });
  };

  return (
    <View className='mine-page'>
      <View className='user-header'>
        {userInfo ? (
          <View className='user-info' onClick={() => handleMenuClick('profile')}>
            <Image
              className='user-avatar'
              src={resolveMediaUrl(userInfo.avatar_url) || DEFAULT_AVATAR}
              mode='aspectFill'
            />
            <View className='user-detail'>
              <Text className='user-name'>{userInfo.nickname || '用户'}</Text>
              <View className='user-plan-badge'>
                <Text className='plan-badge-text'>{planName}</Text>
              </View>
            </View>
          </View>
        ) : (
          <View className='login-entry'>
            <View className='login-avatar'>
              <Text className='login-icon'>👤</Text>
            </View>
            <View className='login-info'>
              <Button className='login-btn' onClick={handleLogin}>
                微信一键登录
              </Button>
              <Text className='login-hint'>登录后可使用票据识别和项目管理功能</Text>
            </View>
          </View>
        )}
      </View>

      {/* 积分卡：余额 + 每日签到。积分是各项功能的通用计量单位 */}
      {userInfo && points && (
        <View className='points-card'>
          <View
            className='points-left'
            onClick={() => Taro.navigateTo({ url: '/pages/points/index' })}
          >
            <Text className='points-label'>我的积分</Text>
            <Text className='points-value'>{points.balance}</Text>
          </View>
          <Button
            className={`points-btn ${points.checked_in_today ? 'points-btn--done' : ''}`}
            onClick={handleCheckin}
            disabled={points.checked_in_today || checkingIn}
          >
            {points.checked_in_today ? '今日已签到' : checkingIn ? '签到中…' : '签到 +2'}
          </Button>
        </View>
      )}

      {/* 本月消耗：计量单位已改为积分，旧的「x/5 次」配额卡已下线 */}
      {userInfo && quota && (
        <View className='usage-row' onClick={() => Taro.navigateTo({ url: '/pages/member/index' })}>
          <Text className='usage-text'>
            本月已消耗 <Text className='usage-num'>{quota.points_used_this_month}</Text> 积分
            · 识别 {quota.points_cost_ocr} 分/张、AI 分析 {quota.points_cost_ai} 分/次
          </Text>
          <Text className='usage-arrow'>›</Text>
        </View>
      )}

      {/* 未绑定手机号时给一个显眼入口：手机号是账号的第二身份，
          换微信后靠它找回；也是后续做用户分析的主要维度。 */}
      {userInfo && !userInfo.phone && (
        <View
          className='phone-tip'
          onClick={() => Taro.navigateTo({ url: '/pages/profile/index' })}
        >
          <View className='phone-tip-left'>
            <Text className='phone-tip-title'>绑定手机号</Text>
            <Text className='phone-tip-desc'>换手机或换微信后可用手机号找回账号</Text>
          </View>
          <Text className='phone-tip-action'>去绑定 ›</Text>
        </View>
      )}

      <View className='menu-list'>
        <View className='menu-item' onClick={() => handleMenuClick('member')}>
          <View className='menu-left'>
            <Text className='menu-icon'>👑</Text>
            <Text className='menu-title'>我的方案</Text>
          </View>
          <View className='menu-right'>
            {userInfo && <Text className='menu-badge'>{planName}</Text>}
            <Text className='menu-arrow'>›</Text>
          </View>
        </View>

        <View className='menu-item' onClick={() => handleMenuClick('profile')}>
          <View className='menu-left'>
            <Text className='menu-icon'>✏️</Text>
            <Text className='menu-title'>编辑资料</Text>
          </View>
          <View className='menu-right'>
            {!userInfo?.nickname && <Text className='menu-value'>未设置</Text>}
            <Text className='menu-arrow'>›</Text>
          </View>
        </View>

        <View className='menu-item' onClick={() => Taro.navigateTo({ url: '/pages/points/index' })}>
          <View className='menu-left'>
            <Text className='menu-icon'>📊</Text>
            <Text className='menu-title'>我的积分</Text>
          </View>
          <View className='menu-right'>
            {quota && <Text className='menu-value'>{quota.points_balance} 分</Text>}
            <Text className='menu-arrow'>›</Text>
          </View>
        </View>

        <View className='menu-item' onClick={() => Taro.navigateTo({ url: '/pages/checkin/index' })}>
          <View className='menu-left'>
            <Text className='menu-icon'>📅</Text>
            <Text className='menu-title'>每日签到</Text>
          </View>
          <View className='menu-right'>
            {points?.checked_in_today && <Text className='menu-value'>今日已签</Text>}
            <Text className='menu-arrow'>›</Text>
          </View>
        </View>

        <View className='menu-item' onClick={() => handleMenuClick('toolkit')}>
          <View className='menu-left'>
            <Text className='menu-icon'>🧰</Text>
            <Text className='menu-title'>工具箱</Text>
          </View>
          <Text className='menu-arrow'>›</Text>
        </View>

        <Button className='menu-item menu-item-btn' openType='contact'>
          <View className='menu-left'>
            <Text className='menu-icon'>💬</Text>
            <Text className='menu-title'>在线客服</Text>
          </View>
          <Text className='menu-arrow'>›</Text>
        </Button>

        <View className='menu-item' onClick={() => handleMenuClick('privacy')}>
          <View className='menu-left'>
            <Text className='menu-icon'>🔒</Text>
            <Text className='menu-title'>隐私政策</Text>
          </View>
          <Text className='menu-arrow'>›</Text>
        </View>

        <View className='menu-item' onClick={() => handleMenuClick('about')}>
          <View className='menu-left'>
            <Text className='menu-icon'>ℹ️</Text>
            <Text className='menu-title'>关于AI票小助</Text>
          </View>
          <Text className='menu-arrow'>›</Text>
        </View>
      </View>

      {userInfo && (
        <View className='menu-list danger-list'>
          <View className='menu-item' onClick={handleDeleteAccount}>
            <View className='menu-left'>
              <Text className='menu-icon'>⚠️</Text>
              <Text className='menu-title danger-title'>注销账号</Text>
            </View>
            <Text className='menu-arrow'>›</Text>
          </View>
        </View>
      )}

      {userInfo && (
        <Button className='logout-btn' onClick={handleLogout}>
          退出登录
        </Button>
      )}
    </View>
  );
}
