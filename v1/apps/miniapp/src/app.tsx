import { PropsWithChildren } from 'react';
import Taro from '@tarojs/taro';
import { useStore } from './store';
import './app.scss';

const CLOUD_ENV = process.env.TARO_APP_CLOUD_ENV as string;
const USE_CALL_CONTAINER = process.env.TARO_APP_USE_CALLCONTAINER !== 'false';

/**
 * 初始化微信云能力。
 *
 * callContainer 要求先 wx.cloud.init({ env })，否则会连到默认环境或直接报错。
 * 这里用 try 包住：本地联调（走 HTTPS）时即使初始化失败也不该拖垮启动。
 */
function initCloud() {
  if (!USE_CALL_CONTAINER) return;

  // 环境 ID 缺失时必须显式报出来。
  // 不报的话 callContainer 会在运行时路由失败，然后静默回落 HTTPS——
  // 在开发者工具里（urlCheck:false）看着一切正常，只有体验版/正式版才炸，
  // 排查成本极高。这个坑我们踩过一次。
  if (!CLOUD_ENV) {
    console.error(
      '[cloud] 缺少 TARO_APP_CLOUD_ENV：callContainer 将路由失败并静默回落 HTTPS。' +
        '体验版/正式版会因域名校验而全部请求失败。请在 .env 里配置云托管环境 ID。'
    );
  }

  try {
    const wxAny = wx as any;
    if (wxAny?.cloud?.init) {
      wxAny.cloud.init({ env: CLOUD_ENV, traceUser: false });
      console.info('[cloud] wx.cloud.init 完成, env =', CLOUD_ENV || '(默认环境)');
    } else {
      console.error('[cloud] 当前基础库不支持 wx.cloud，将只能走 HTTPS 直连');
    }
  } catch (e) {
    // 初始化失败会让后续请求回落到 HTTPS 路径，不影响启动
    console.warn('[cloud] init 失败，将回落到 HTTPS 请求', e);
  }
}

function App({ children }: PropsWithChildren) {
  Taro.useLaunch(() => {
    initCloud();
    const store = useStore.getState();
    store.autoLogin();
  });

  return <>{children}</>;
}

export default App;
