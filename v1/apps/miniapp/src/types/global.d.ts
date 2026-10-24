/**
 * 微信原生对象的全局声明。
 *
 * 只在 callContainer / wx.cloud 这类没有 Taro 封装的能力上使用原生 wx。
 * 声明成 any 是刻意的：这些接口随基础库版本变化，写死类型反而会挡住兼容分支。
 */
declare const wx: any;
