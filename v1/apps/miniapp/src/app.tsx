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
  try {
    const wxAny = wx as any;
    if (wxAny?.cloud?.init) {
      wxAny.cloud.init({ env: CLOUD_ENV, traceUser: false });
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
