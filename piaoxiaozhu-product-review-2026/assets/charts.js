// assets/charts.js — 票小助产品研究报告图表
// 所有颜色均从 CSS 变量读取，保持与主题一致
(function () {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();

  var axisLabel = { color: muted, fontSize: 12 };
  var splitLine = { lineStyle: { color: rule } };

  // --- Mermaid init ---
  if (window.mermaid) {
    window.mermaid.initialize({ startOnLoad: true, theme: 'neutral', securityLevel: 'loose' });
  }

  // --- Chart 1: 能力覆盖雷达 ---
  var radarEl = document.getElementById('chart-radar');
  if (radarEl) {
    var radar = echarts.init(radarEl, null, { renderer: 'svg' });
    radar.setOption({
      animation: false,
      tooltip: { trigger: 'item', appendToBody: true },
      legend: {
        data: ['票小助', '个人记账 App（中位）', '企业费控 SaaS（代表）'],
        bottom: 0,
        textStyle: { color: ink, fontSize: 12 }
      },
      color: [accent, muted, accent2],
      radar: {
        center: ['50%', '48%'],
        radius: '66%',
        indicator: [
          { name: '票据采集识别', max: 10 },
          { name: '验真与合规', max: 10 },
          { name: '记账/流水深度', max: 10 },
          { name: '报表与导出', max: 10 },
          { name: '协作能力', max: 10 },
          { name: 'AI 能力', max: 10 }
        ],
        axisName: { color: ink, fontSize: 12 },
        splitLine: splitLine,
        splitArea: { show: false },
        axisLine: { lineStyle: { color: rule } }
      },
      series: [{
        type: 'radar',
        symbolSize: 5,
        data: [
          { value: [9, 1, 5, 7, 1, 4], name: '票小助', areaStyle: { opacity: 0.18 } },
          { value: [3, 1, 8, 6, 4, 5], name: '个人记账 App（中位）', areaStyle: { opacity: 0.08 } },
          { value: [9, 9, 8, 9, 9, 8], name: '企业费控 SaaS（代表）', areaStyle: { opacity: 0.08 } }
        ]
      }]
    });
    window.addEventListener('resize', function () { radar.resize(); });
  }

  // --- Chart 2: 定位图 ---
  var posEl = document.getElementById('chart-position');
  if (posEl) {
    var pos = echarts.init(posEl, null, { renderer: 'svg' });
    var posData = [
      { name: '票小助', value: [6.5, 9.0] },
      { name: '随手记 / 钱迹', value: [2.5, 8.5] },
      { name: '合思 / 分贝通', value: [9.0, 4.0] },
      { name: 'Expensify / Ramp', value: [8.0, 6.5] },
      { name: 'Excel / 手工台账', value: [1.0, 2.0] }
    ];
    pos.setOption({
      animation: false,
      tooltip: {
        trigger: 'item',
        appendToBody: true,
        formatter: function (p) {
          return p.data.name + '<br/>票据专业度：' + p.data.value[0] + '<br/>轻量易用性：' + p.data.value[1];
        }
      },
      grid: { left: 56, right: 40, top: 30, bottom: 56 },
      xAxis: {
        name: '票据 / 发票专业能力 →',
        nameLocation: 'middle',
        nameGap: 34,
        nameTextStyle: { color: ink, fontSize: 12 },
        min: 0, max: 10,
        axisLabel: axisLabel,
        splitLine: splitLine,
        axisLine: { lineStyle: { color: rule } }
      },
      yAxis: {
        name: '轻量易用 / 触达便捷 →',
        nameLocation: 'middle',
        nameGap: 40,
        nameTextStyle: { color: ink, fontSize: 12 },
        min: 0, max: 10,
        axisLabel: axisLabel,
        splitLine: splitLine,
        axisLine: { lineStyle: { color: rule } }
      },
      series: [{
        type: 'scatter',
        symbolSize: 18,
        label: {
          show: true,
          formatter: '{b}',
          position: 'right',
          color: ink,
          fontSize: 12
        },
        itemStyle: {
          color: function (p) {
            return p.data.name === '票小助' ? accent : accent2 + 'B3';
          },
          borderColor: bg2,
          borderWidth: 2
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: rule, type: 'dashed' },
          label: { show: false },
          data: [{ xAxis: 5.5 }, { yAxis: 5.5 }]
        },
        data: posData
      }]
    });
    window.addEventListener('resize', function () { pos.resize(); });
  }

  // --- Chart 3: 优先级矩阵 ---
  var priEl = document.getElementById('chart-priority');
  if (priEl) {
    var pri = echarts.init(priEl, null, { renderer: 'svg' });
    var priData = [
      { name: '支付 + 存储 + 部署', value: [4, 9.0] },
      { name: '发票验真', value: [6, 8.4] },
      { name: '发票查重', value: [5, 8.0] },
      { name: '数电票解析与导入', value: [5, 8.0] },
      { name: '微信/支付宝账单导入', value: [6, 7.0] },
      { name: 'AI 经营洞察', value: [5, 7.0] },
      { name: '税务合规 / 电子档案', value: [7, 7.0] },
      { name: '多人账本 / 协作', value: [8, 6.0] },
      { name: '语音 / 截屏快捷记账', value: [3, 5.0] },
      { name: '预算与提醒', value: [3, 5.0] }
    ];
    pri.setOption({
      animation: false,
      tooltip: {
        trigger: 'item',
        appendToBody: true,
        formatter: function (p) {
          return p.data.name + '<br/>用户价值：' + p.data.value[1] + '<br/>实施复杂度：' + p.data.value[0];
        }
      },
      grid: { left: 60, right: 46, top: 30, bottom: 56 },
      xAxis: {
        name: '实施复杂度 →',
        nameLocation: 'middle',
        nameGap: 34,
        nameTextStyle: { color: ink, fontSize: 12 },
        min: 0, max: 10,
        axisLabel: axisLabel,
        splitLine: splitLine,
        axisLine: { lineStyle: { color: rule } }
      },
      yAxis: {
        name: '用户价值 / 影响力 →',
        nameLocation: 'middle',
        nameGap: 42,
        nameTextStyle: { color: ink, fontSize: 12 },
        min: 0, max: 10,
        axisLabel: axisLabel,
        splitLine: splitLine,
        axisLine: { lineStyle: { color: rule } }
      },
      series: [{
        type: 'scatter',
        symbolSize: 18,
        label: {
          show: true,
          formatter: '{b}',
          position: 'right',
          color: ink,
          fontSize: 11
        },
        itemStyle: {
          color: function (p) {
            var v = p.data.value;
            return (v[0] <= 5.5 && v[1] >= 6) ? accent : accent2 + 'B3';
          },
          borderColor: bg2,
          borderWidth: 2
        },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: rule, type: 'dashed' },
          label: { show: false },
          data: [{ xAxis: 5.5 }, { yAxis: 6 }]
        },
        data: priData
      }]
    });
    window.addEventListener('resize', function () { pri.resize(); });
  }
})();
