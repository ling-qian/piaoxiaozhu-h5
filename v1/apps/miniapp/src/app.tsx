import { PropsWithChildren } from 'react';
import Taro from '@tarojs/taro';
import { useStore } from './store';
import './app.scss';

function App({ children }: PropsWithChildren) {
  Taro.useLaunch(() => {
    const store = useStore.getState();
    store.autoLogin();
  });

  return <>{children}</>;
}

export default App;
