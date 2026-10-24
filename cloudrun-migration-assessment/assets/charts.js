(function () {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();

  var baseText = { color: muted, fontSize: 12 };
  var axisLine = { lineStyle: { color: rule } };
  var splitLine = { lineStyle: { color: rule, type: 'dashed' } };

  // ---- 图 2：改动量按模块分布 ----
  var el2 = document.getElementById('chart-effort');
  if (el2) {
    var c2 = echarts.init(el2, null, { renderer: 'svg' });
    c2.setOption({
      animation: false,
      grid: { left: 130, right: 60, top: 20, bottom: 40 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, appendToBody: true },
      xAxis: {
        type: 'value',
        name: '相对工作量（人日）',
        nameTextStyle: baseText,
        axisLabel: baseText,
        axisLine: axisLine,
        splitLine: splitLine
      },
      yAxis: {
        type: 'category',
        data: [
          '小程序请求层改造',
          'OCR 异步架构重构',
          '镜像与部署配置',
          '支付回调方案改造',
          '对象存储迁移',
          '数据库迁移（选 PG）',
          '数据库迁移（选 MySQL）'
        ],
        axisLabel: { color: ink, fontSize: 12 },
        axisLine: axisLine,
        axisTick: { show: false }
      },
      series: [{
        type: 'bar',
        data: [
          { value: 4, itemStyle: { color: accent } },
          { value: 6, itemStyle: { color: accent } },
          { value: 3, itemStyle: { color: accent } },
          { value: 3, itemStyle: { color: accent + '99' } },
          { value: 2, itemStyle: { color: accent2 } },
          { value: 1, itemStyle: { color: accent2 } },
          { value: 9, itemStyle: { color: accent2 } }
        ],
        barWidth: 18,
        label: { show: true, position: 'right', color: ink, fontSize: 12, formatter: '{c}' }
      }]
    });
    window.addEventListener('resize', function () { c2.resize(); });
  }

  // ---- 图 3：三方案综合对比 ----
  var el3 = document.getElementById('chart-options');
  if (el3) {
    var c3 = echarts.init(el3, null, { renderer: 'svg' });
    c3.setOption({
      animation: false,
      tooltip: { trigger: 'axis', appendToBody: true },
      legend: {
        data: ['A · 维持现状', 'B · 云托管（取巧）', 'C · 云托管（标准）'],
        textStyle: { color: ink, fontSize: 12 },
        bottom: 0
      },
      grid: { left: 90, right: 40, top: 30, bottom: 70 },
      xAxis: {
        type: 'category',
        data: ['上线速度', '改动量\n(越低越好)', '成本控制', '风险控制'],
        axisLabel: { color: ink, fontSize: 12, lineHeight: 16 },
        axisLine: axisLine,
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value',
        max: 100,
        name: '评分',
        nameTextStyle: baseText,
        axisLabel: baseText,
        axisLine: axisLine,
        splitLine: splitLine
      },
      series: [
        {
          name: 'A · 维持现状',
          type: 'bar',
          data: [30, 95, 100, 90],
          itemStyle: { color: accent2 },
          barWidth: 20,
          label: { show: true, position: 'top', color: muted, fontSize: 11 }
        },
        {
          name: 'B · 云托管（取巧）',
          type: 'bar',
          data: [85, 55, 45, 55],
          itemStyle: { color: accent },
          barWidth: 20,
          label: { show: true, position: 'top', color: accent, fontSize: 11 }
        },
        {
          name: 'C · 云托管（标准）',
          type: 'bar',
          data: [60, 20, 35, 30],
          itemStyle: { color: accent + '66' },
          barWidth: 20,
          label: { show: true, position: 'top', color: muted, fontSize: 11 }
        }
      ]
    });
    window.addEventListener('resize', function () { c3.resize(); });
  }
})();
