import { View, Text, Button, Input, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState } from 'react';
import { authApi, resolveMediaUrl, userApi } from '../../services/api';
import { PHONE_BIND_ENABLED } from '../../config/features';
import { useStore } from '../../store';
import { explainPhoneError } from '../../utils/phoneError';
import './index.scss';

const DEFAULT_AVATAR = 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI9FhqR6no4pKIrgIbEDk0YqIjYzS7JNibb2nZcTiaS6xFupbGBy1QcBcQ2Q';

export default function Profile() {
  const { userInfo, fetchUserInfo } = useStore();
  const [nickname, setNickname] = useState(userInfo?.nickname || '');
  const [avatarUrl, setAvatarUrl] = useState(userInfo?.avatar_url || '');
  const [saving, setSaving] = useState(false);

  // 头像是 chooseAvatar 给到的临时文件，先本地预览再上传换回可长期访问的 URL
  const handleChooseAvatar = async (e: any) => {
    const tempPath = e?.detail?.avatarUrl;
    if (!tempPath) return;

    const previous = userInfo?.avatar_url || '';
    setAvatarUrl(tempPath);
    setSaving(true);
    try {
      const res = await userApi.uploadAvatar(tempPath);
      setAvatarUrl(res.avatar_url);
      await fetchUserInfo();
      Taro.showToast({ title: '头像已更新', icon: 'success' });
    } catch (err: any) {
      setAvatarUrl(previous);
      Taro.showToast({ title: err?.message || '头像上传失败', icon: 'none' });
    } finally {
      setSaving(false);
    }
  };

  const handleGetPhoneNumber = async (e: any) => {
    const detail = e?.detail || {};
    const code = detail.code;
    if (!code) {
      // 错误分类（额度用尽/用户拒绝/无权限）与授权登录页共用一份，保证口径一致
      Taro.showToast({ title: explainPhoneError(detail), icon: 'none' });
      return;
    }
    try {
      await authApi.bindPhone(code);
      await fetchUserInfo();
      Taro.showToast({ title: '手机号已绑定', icon: 'success' });
    } catch (err: any) {
      Taro.showToast({ title: err?.message || '手机号绑定失败', icon: 'none' });
    }
  };

  const handleSaveNickname = async () => {
    const trimmed = nickname.trim();
    if (!trimmed) {
      Taro.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }
    if (trimmed === (userInfo?.nickname || '')) {
      Taro.showToast({ title: '昵称未修改', icon: 'none' });
      return;
    }

    setSaving(true);
    try {
      await userApi.updateMe({ nickname: trimmed });
      await fetchUserInfo();
      Taro.showToast({ title: '昵称已保存', icon: 'success' });
    } catch (err: any) {
      Taro.showToast({ title: err?.message || '保存失败', icon: 'none' });
    } finally {
      setSaving(false);
    }
  };

  const maskedPhone = userInfo?.phone
    ? `${userInfo.phone.slice(0, 3)}****${userInfo.phone.slice(-4)}`
    : '';

  return (
    <View className='profile-page'>
      <View className='form-card'>
        <View className='form-row'>
          <Text className='row-label'>头像</Text>
          <Button
            className='avatar-btn'
            openType='chooseAvatar'
            onChooseAvatar={handleChooseAvatar}
          >
            <Image
              className='avatar-preview'
              src={resolveMediaUrl(avatarUrl) || DEFAULT_AVATAR}
              mode='aspectFill'
            />
            <Text className='row-arrow'>›</Text>
          </Button>
        </View>

        <View className='form-row'>
          <Text className='row-label'>昵称</Text>
          <Input
            className='row-input'
            type='nickname'
            placeholder='点击填写昵称'
            placeholderClass='input-placeholder'
            value={nickname}
            onInput={(e) => setNickname(e.detail.value)}
          />
        </View>

        {PHONE_BIND_ENABLED && (
          <View className='form-row'>
            <Text className='row-label'>手机号</Text>
            {userInfo?.phone ? (
              <Text className='row-value'>{maskedPhone}</Text>
            ) : (
              <Button
                className='bind-phone-btn'
                openType='getPhoneNumber'
                onGetPhoneNumber={handleGetPhoneNumber}
              >
                立即绑定
              </Button>
            )}
          </View>
        )}
      </View>

      <Button className='save-btn' loading={saving} disabled={saving} onClick={handleSaveNickname}>
        保存昵称
      </Button>

      <Text className='form-tip'>
        {PHONE_BIND_ENABLED
          ? '昵称与头像仅用于在小程序内的展示；手机号用于账号找回与客服联系，不会用于其他用途。'
          : '昵称与头像仅用于在小程序内的展示，不会用于其他用途。'}
      </Text>
    </View>
  );
}
