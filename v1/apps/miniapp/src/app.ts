import { PropsWithChildren } from 'react';
import Taro from '@tarojs/taro';
import { useStore } from './store';
import './app.scss';

function App({ children }: PropsWithChildren) {
  Taro.useLaunch(() => {
    const store = useStore.getState();
    const token = Taro.getStorageSync('token');
    if (token) {
      store.setToken(token);
      store.fetchUserInfo();
    } else {
      store.checkLogin();
    }
  });

  return <>{children}</>;
}

export default App;
