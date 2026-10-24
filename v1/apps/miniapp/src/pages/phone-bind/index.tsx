import { Button, View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useEffect, useState } from 'react';
import { authApi } from '../../services/api';
import { useStore } from '../../store';
import { explainPhoneError, isDevtools } from '../../utils/phoneError';
import './index.scss';

export default function PhoneBind() {
  const userInfo = useStore((s) => s.userInfo);
  const fetchUserInfo = useStore((s) => s.fetchUserInfo);
  const [submitting, setSubmitting] = useState(false);
  const [devtools, setDevtools] = useState(false);

  useEffect(() => {
    // 手机号授权只支持真机；模拟器里点击必报「没有权限」
    setDevtools(isDevtools());
  }, []);

  /**
   * 返回上一页（从「我的」页进来的正常路径）。
   * 页面栈为空（如冷启动直达）时兜底回首页。
   */
  const goBack = () => {
    const pages = Taro.getCurrentPages();
    if (pages.length > 1) {
      Taro.navigateBack();
    } else {
      Taro.switchTab({ url: '/pages/index/index' });
    }
  };

  // 已绑定的用户不需要此页（防止手动输入路径进入）
  useEffect(() => {
    if (userInfo?.phone) goBack();
  }, [userInfo?.phone]);

  const handleGetPhoneNumber = async (e: any) => {
    const detail = e?.detail || {};
    const code = detail.code;
    if (!code) {
      // 用户点「不允许」走这里：不弹错误，安静回首页
      const errMsg: string = detail.errMsg || '';
      if (errMsg.includes('deny') || errMsg.includes('cancel')) {
        goBack();
        return;
      }
      Taro.showToast({ title: explainPhoneError(detail), icon: 'none' });
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      await authApi.bindPhone(code);
      await fetchUserInfo();
      Taro.showToast({ title: '登录成功', icon: 'success' });
      goBack();
    } catch (err: any) {
      Taro.showToast({ title: err?.message || '登录失败，请重试', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className='phone-bind-page'>
      {/* 品牌区：占满上方，仿大众点评的留白布局 */}
      <View className='brand-area'>
        <Text className='brand-icon'>🧾</Text>
        <Text className='brand-name'>AI票小助</Text>
        <Text className='brand-slogan'>发 现 记 账 更 简 单</Text>
      </View>

      {/* 底部弹层：授权区 */}
      <View className='sheet'>
        {devtools && (
          <View className='devtools-tip'>
            <Text className='devtools-text'>
              ⚠ 开发者工具不支持手机号授权，请点「预览」用真机测试
            </Text>
          </View>
        )}
        <View className='sheet-head'>
          <Text className='sheet-badge'>🧾</Text>
          <Text className='sheet-app'>AI票小助 · 票据管理助手</Text>
        </View>
        <Text className='sheet-title'>申请获取并验证你的手机号</Text>
        <Text className='sheet-desc'>用于登录账号与积分安全，未注册将自动创建</Text>

        <Button
          className='phone-btn'
          openType='getPhoneNumber'
          onGetPhoneNumber={handleGetPhoneNumber}
          loading={submitting}
          disabled={submitting}
        >
          微信手机号一键登录
        </Button>

        <View className='deny-btn' onClick={goBack}>
          <Text className='deny-text'>不允许</Text>
        </View>

        <Text className='skip-link' onClick={goBack}>
          暂不绑定，先去逛逛 ›
        </Text>
      </View>
    </View>
  );
}
