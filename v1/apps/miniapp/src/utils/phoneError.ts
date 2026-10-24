import Taro from '@tarojs/taro';

/**
 * 手机号授权（getPhoneNumber）的错误分类。
 *
 * profile 页与 phone-bind 页共用，保证两处提示口径一致。
 * 常见错误：
 * - errno 1400001：组件额度用完（体验包 1000 次）
 * - errMsg 含 deny/cancel：用户点了「不允许」
 * - errMsg 含「没有权限」：①后台《用户隐私保护指引》未声明手机号 ②在开发者工具里点的
 */

export function isDevtools(): boolean {
  try {
    return Taro.getSystemInfoSync().platform === 'devtools';
  } catch {
    return false;
  }
}

export function explainPhoneError(detail: any): string {
  const errMsg: string = detail?.errMsg || '';
  const errno: number | undefined = detail?.errno;
  if (errno === 1400001) return '手机号验证次数已用完，请联系客服';
  if (errMsg.includes('deny') || errMsg.includes('cancel')) return '已取消授权';
  if (errMsg.includes('没有权限') || errMsg.includes('permission')) {
    return (
      '未获得手机号授权：①后台「用户隐私保护指引」需声明收集手机号并发布 ' +
      '②需在真机上测试（开发者工具不支持）'
    );
  }
  return `获取手机号失败：${errMsg || '未知原因'}`;
}
