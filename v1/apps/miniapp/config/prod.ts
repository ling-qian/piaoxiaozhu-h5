import type { UserConfigExport } from '@tarojs/cli';

export default {
  logger: {
    quiet: false,
    stats: true,
  },
  mini: {
    miniCssExtractPluginOption: {
      ignoreOrder: true,
    },
  },
  h5: {
    miniCssExtractPluginOption: {
      ignoreOrder: true,
    },
  },
} satisfies UserConfigExport;
