import { defineConfig } from '@tarojs/cli';
import devConfig from './dev';
import prodConfig from './prod';
import path from 'path';

const API_URL = process.env.TARO_APP_API_URL || 'http://localhost:8000';
const IS_PRODUCTION_BUILD = process.env.NODE_ENV === 'production';

// 正式版小程序要求 request 合法域名必须是 HTTPS，且不能是局域网 IP / localhost。
// 用 .env 里的联调地址打正式包，真机上会直接「网络异常」，且提审必被驳回。
// 这里在构建阶段就把问题喊出来，避免打好的包被误上传。
if (IS_PRODUCTION_BUILD && !API_URL.startsWith('https://')) {
  console.warn(
    [
      '',
      '================================================================',
      `[票小助 Pro] 构建警告：本次是生产构建，但后端地址为 ${API_URL}`,
      '  该地址不是 HTTPS。提审前请重新构建：',
      '    TARO_APP_API_URL=https://<你的域名> npm run build:weapp',
      '================================================================',
      '',
    ].join('\n')
  );
}

export default defineConfig(async (merge) => {
  const baseConfig = {
    projectName: 'piaoxiaozhu',
    date: '2026-5-22',
    designWidth: 750,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      375: 2,
      828: 1.81 / 2,
    },
    sourceRoot: 'src',
    outputRoot: 'dist',
    plugins: ['@tarojs/plugin-platform-weapp'],
    defineConstants: {
      'process.env.TARO_APP_API_URL': JSON.stringify(API_URL),
      // 云托管环境 ID：callContainer 必须显式指定，否则会连到默认环境。
      'process.env.TARO_APP_CLOUD_ENV': JSON.stringify(
        process.env.TARO_APP_CLOUD_ENV || 'prod-d9gbxkw9cfb08ce28'
      ),
      // 请求通道开关。
      // 默认 false（HTTPS 直连）：实测云调用的环境 ID 未核实，线上表现为
      // 「timeout 15000 / no baseresponse」，全部接口不可用。
      // 拿到正确的云托管环境 ID 后，把 .env 里的 TARO_APP_USE_CALLCONTAINER 设为 true 即可启用。
      'process.env.TARO_APP_USE_CALLCONTAINER': JSON.stringify(
        process.env.TARO_APP_USE_CALLCONTAINER || 'false'
      ),
      // 云托管服务名：callContainer 靠 X-WX-SERVICE 路由，名字必须与服务一致
      'process.env.TARO_APP_CLOUD_SERVICE': JSON.stringify(
        process.env.TARO_APP_CLOUD_SERVICE || 'api'
      ),
    },
    copy: { patterns: [], options: {} },
    framework: 'react',
    compiler: {
      type: 'webpack5',
      prebundle: { enable: false },
    },
    alias: {
      '@': path.resolve(__dirname, '..', 'src'),
    },
    sass: {
      data: '@import "@/assets/styles/variables.scss";',
      projectDirectory: path.resolve(__dirname, '..'),
    },
    mini: {
      postcss: {
        pxtransform: { enable: true, config: {} },
        cssModules: {
          enable: false,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]',
          },
        },
      },
    },
    h5: {
      publicPath: '/',
      staticDirectory: 'static',
      postcss: {
        autoprefixer: { enable: true, config: {} },
        cssModules: {
          enable: false,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]',
          },
        },
      },
    },
    rn: {
      appName: 'piaoxiaozhu',
      postcss: {
        cssModules: {
          enable: false,
        },
      },
    },
  };

  if (process.env.NODE_ENV === 'development') {
    return merge({}, baseConfig, devConfig);
  }
  return merge({}, baseConfig, prodConfig);
});
