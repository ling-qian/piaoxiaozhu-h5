(function () {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();

  var baseText = { color: muted, fontSize: 12, fontFamily: 'Instrument Sans, PingFang SC, sans-serif' };

  /* ============================================================
     图 2：主要竞品公开年费对比（横向条形图）
     数据来源：正文引用 [20][21][25][26] 与本项目套餐配置
     ============================================================ */
  var pricingEl = document.getElementById('chart-pricing');
  if (pricingEl) {
    var pricing = echarts.init(pricingEl, null, { renderer: 'svg' });
    var rows = [
      { name: '微信官方票夹 / 记账本 / 官方查验', value: 0, src: '[16][17][12]' },
      { name: '钱迹（个人记账年费）', value: 36, src: '[25]' },
      { name: '橙子发票查重（3 年折算 /年）', value: 99, src: '[20][21]' },
      { name: '橙子发票查重（1 年）', value: 199, src: '[20][21]' },
      { name: '票小助 Pro（¥29/月 ×12）', value: 348, src: '本项目套餐配置' },
      { name: '银豹收银（通用版年费）', value: 360, src: '[26]' }
    ];
    rows.sort(function (a, b) { return a.value - b.value; });

    pricing.setOption({
      animation: false,
      tooltip: {
        appendToBody: true,
        formatter: function (p) {
          var d = rows[p.dataIndex];
          return '<b>' + d.name + '</b><br/>公开年费：¥' + d.value + ' 元/年<br/>来源：' + d.src;
        }
      },
      grid: { left: 232, right: 78, top: 18, bottom: 34 },
      xAxis: {
        type: 'value',
        name: '元 / 年',
        nameTextStyle: baseText,
        axisLabel: baseText,
        axisLine: { lineStyle: { color: rule } },
        splitLine: { lineStyle: { color: rule } }
      },
      yAxis: {
        type: 'category',
        data: rows.map(function (d) { return d.name; }),
        axisLabel: { color: ink, fontSize: 12 },
        axisLine: { lineStyle: { color: rule } },
        axisTick: { show: false }
      },
      series: [{
        type: 'bar',
        barWidth: 20,
        data: rows.map(function (d) {
          var isSelf = d.name.indexOf('票小助') === 0;
          return {
            value: d.value,
            itemStyle: {
              color: isSelf ? accent : accent + '66',
              borderRadius: [0, 3, 3, 0]
            }
          };
        }),
        label: {
          show: true,
          position: 'right',
          formatter: function (p) { return '¥' + p.value; },
          color: ink,
          fontSize: 12,
          fontWeight: 600
        }
      }]
    });
    window.addEventListener('resize', function () { pricing.resize(); });
  }

  /* ============================================================
     图 4：能力雷达（0–5 分制，作者按第 5 节矩阵换算，推断性评分）
     ============================================================ */
  var radarEl = document.getElementById('chart-radar');
  if (radarEl) {
    var radar = echarts.init(radarEl, null, { renderer: 'svg' });
    radar.setOption({
      animation: false,
      tooltip: { appendToBody: true, trigger: 'item' },
      legend: {
        bottom: 0,
        textStyle: baseText,
        itemWidth: 14,
        itemHeight: 8
      },
      radar: {
        center: ['50%', '46%'],
        radius: '62%',
        indicator: [
          { name: '票据采集与结构化', max: 5 },
          { name: '成本分类与经营核算', max: 5 },
          { name: '发票验真与查重', max: 5 },
          { name: '合规导出 / XML 归档', max: 5 },
          { name: '个体户无员工适配', max: 5 },
          { name: '微信内零安装触达', max: 5 }
        ],
        axisName: { color: ink, fontSize: 11.5 },
        splitLine: { lineStyle: { color: rule } },
        splitArea: { show: false },
        axisLine: { lineStyle: { color: rule } }
      },
      series: [{
        type: 'radar',
        symbolSize: 5,
        data: [
          {
            name: '微信官方（票夹 + 发票助手）',
            value: [4, 1, 3, 2, 2, 5],
            lineStyle: { color: muted, width: 1.6 },
            itemStyle: { color: muted },
            areaStyle: { color: muted + '1A' }
          },
          {
            name: '发票查重工具（橙子等）',
            value: [3, 1, 5, 3, 3, 4],
            lineStyle: { color: accent2, width: 1.6 },
            itemStyle: { color: accent2 },
            areaStyle: { color: accent2 + '1A' }
          },
          {
            name: '票小助（现状）',
            value: [4, 4, 0, 2, 5, 5],
            lineStyle: { color: accent, width: 2.4 },
            itemStyle: { color: accent },
            areaStyle: { color: accent + '2E' }
          },
          {
            name: '票小助（目标态 · 6 个月）',
            value: [5, 5, 5, 5, 5, 5],
            lineStyle: { color: accent, width: 1.2, type: 'dashed' },
            itemStyle: { color: accent },
            areaStyle: { color: 'transparent' },
            symbol: 'none'
          }
        ]
      }]
    });
    window.addEventListener('resize', function () { radar.resize(); });
  }

  /* ============================================================
     图 3：竞争定位 2×2（气泡散点）
     坐标为作者依据第 4 节公开功能清单的推断性定位
     ============================================================ */
  var posEl = document.getElementById('chart-position');
  if (posEl) {
    var pos = echarts.init(posEl, null, { renderer: 'svg' });
    var bubble = [
      { name: '微信记账本', value: [2, 1.5], size: 16, src: '官方免费' },
      { name: '个人记账 App（钱迹等）', value: [1.5, 2], size: 16, src: '[23][24][33][34]' },
      { name: '微信发票助手 / 卡包票夹', value: [3, 2], size: 16, src: '[16][18]' },
      { name: '橙子发票查重', value: [7, 4], size: 16, src: '[19][20]' },
      { name: '百望云 / 用友 / 金蝶', value: [8, 5], size: 16, src: '[21]' },
      { name: '银豹 / 美团收银 / 客如云', value: [8.5, 3], size: 16, src: '[26][35]' },
      { name: '微盟 / 有赞', value: [8.5, 2], size: 16, src: '[35][36]' },
      { name: '合思 / 分贝通 / 每刻', value: [9.5, 8], size: 16, src: '[27][28]' },
      { name: '票小助', value: [6.5, 7], size: 30, src: '本项目' }
    ];

    pos.setOption({
      animation: false,
      tooltip: {
        appendToBody: true,
        formatter: function (p) {
          var d = bubble.find(function (b) { return b.name === p.name; }) || {};
          return '<b>' + p.name + '</b><br/>定位坐标：服务对象 ' + p.value[0] + ' / 价值深度 ' + p.value[1] + '<br/>来源：' + (d.src || '—');
        }
      },
      grid: { left: 62, right: 40, top: 26, bottom: 60 },
      xAxis: {
        type: 'value',
        min: 0,
        max: 11,
        name: '服务对象   个人 ──→ 商户经营',
        nameLocation: 'middle',
        nameGap: 30,
        nameTextStyle: baseText,
        axisLabel: { show: false },
        axisLine: { lineStyle: { color: rule } },
        splitLine: { lineStyle: { color: rule, type: 'dashed' } }
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 11,
        name: '交付价值深度   票面存储 ──→ 经营决策',
        nameLocation: 'middle',
        nameGap: 42,
        nameTextStyle: baseText,
        axisLabel: { show: false },
        axisLine: { lineStyle: { color: rule } },
        splitLine: { lineStyle: { color: rule, type: 'dashed' } }
      },
      series: [{
        type: 'scatter',
        symbol: 'circle',
        label: {
          show: true,
          position: 'top',
          distance: 8,
          formatter: '{b}',
          color: ink,
          fontSize: 11
        },
        data: bubble.map(function (d) {
          var isSelf = d.name === '票小助';
          return {
            name: d.name,
            value: d.value,
            symbolSize: d.size,
            itemStyle: {
              color: isSelf ? accent2 : accent + '80',
              borderColor: isSelf ? accent2 : bg2,
              borderWidth: isSelf ? 2 : 1
            }
          };
        }),
        markArea: {
          silent: true,
          label: {
            show: true,
            position: 'insideTopLeft',
            color: muted,
            fontSize: 11,
            fontWeight: 600
          },
          data: [
            [
              { name: '个人 × 票面层\n（免费替代最强）', xAxis: 0, yAxis: 0, itemStyle: { color: 'rgba(92,107,122,0.05)' } },
              { xAxis: 5.5, yAxis: 5.5 }
            ],
            [
              { name: '经营 × 票面层\n（付费拥挤区）', xAxis: 5.5, yAxis: 0, itemStyle: { color: 'rgba(194,65,12,0.06)' } },
              { xAxis: 11, yAxis: 5.5 }
            ],
            [
              { name: '个人 × 决策层\n（客群不匹配）', xAxis: 0, yAxis: 5.5, itemStyle: { color: 'rgba(92,107,122,0.05)' } },
              { xAxis: 5.5, yAxis: 11 }
            ],
            [
              { name: '经营 × 决策层  浅空白\n（票小助所在）', xAxis: 5.5, yAxis: 5.5, itemStyle: { color: 'rgba(15,110,99,0.09)' } },
              { xAxis: 11, yAxis: 11 }
            ]
          ]
        }
      }]
    });
    window.addEventListener('resize', function () { pos.resize(); });
  }
})();
