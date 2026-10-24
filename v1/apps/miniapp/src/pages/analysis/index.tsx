import { View, Text, Button, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState } from 'react';
import { useStore } from '../../store';
import { reportApi } from '../../services/api';
import './index.scss';
import { requireLogin } from '../../utils/authGate';

interface Summary {
  totalIncome: number;
  totalExpense: number;
  grossProfit: number;
  grossMargin: number;
  categoryBreakdown: Record<string, number>;
  monthlyData: Record<string, { income: number; expense: number }>;
  topMerchants: [string, number][];
  recordCount: number;
}

/** 去掉 markdown 记号，小程序里不做富文本渲染，保证可读即可 */
function plainText(md: string): string {
  return md
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^[-*]\s+/gm, '· ');
}

function money(n: number): string {
  return `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Analysis() {
  const { currentProject } = useStore();
  const projectId =
    Taro.getCurrentInstance().router?.params?.projectId || currentProject?.id || '';

  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const runAnalysis = async () => {
    if (!projectId) {
      Taro.showToast({ title: '请先选择项目', icon: 'none' });
      return;
    }
    // 分析要扣积分，必须先有正式登录
    if (!(await requireLogin())) return;
    setLoading(true);
    setError('');
    try {
      const res: any = await reportApi.analyzeProject(projectId);
      setSummary(res.summary);
      setText(plainText(res.analysis || ''));
      Taro.pageScrollTo({ scrollTop: 0, duration: 200 });
    } catch (e: any) {
      const msg = e?.message || '分析失败，请稍后重试';
      setError(msg);
      Taro.showToast({ title: msg, icon: 'none' });
    } finally {
      setLoading(false);
    }
  };

  const categories = summary
    ? Object.entries(summary.categoryBreakdown).sort((a, b) => b[1] - a[1]).slice(0, 8)
    : [];
  const maxCategory = categories.length ? categories[0][1] : 0;
  const totalExpense = summary?.totalExpense || 0;

  const months = summary
    ? Object.entries(summary.monthlyData).sort((a, b) => a[0].localeCompare(b[0])).slice(-6)
    : [];

  return (
    <ScrollView scrollY className='analysis-page'>
      <View className='hero'>
        <Text className='hero-title'>AI 经营分析</Text>
        <Text className='hero-sub'>
          把已归档的票据汇总成收入 / 成本 / 趋势，交给 AI 给出可落地的经营建议。
        </Text>
        <Button className='run-btn' onClick={runAnalysis} disabled={loading}>
          {loading ? '分析中…' : summary ? '重新分析' : '开始分析'}
        </Button>
        {loading && <Text className='hint'>AI 正在分析您的经营数据，通常需要 10–20 秒，请勿退出</Text>}
      </View>

      {error && !loading && (
        <View className='card error-card'>
          <Text className='error-text'>{error}</Text>
        </View>
      )}

      {!summary && !loading && !error && (
        <View className='card empty-card'>
          <Text className='empty-title'>还没有分析结果</Text>
          <Text className='empty-sub'>点击上方「开始分析」即可生成报告</Text>
        </View>
      )}

      {summary && (
        <>
          <View className='stat-grid'>
            <View className='stat-card'>
              <Text className='stat-label'>总收入</Text>
              <Text className='stat-value income'>{money(summary.totalIncome)}</Text>
            </View>
            <View className='stat-card'>
              <Text className='stat-label'>总支出</Text>
              <Text className='stat-value expense'>{money(summary.totalExpense)}</Text>
            </View>
            <View className='stat-card'>
              <Text className='stat-label'>毛利润</Text>
              <Text className={`stat-value ${summary.grossProfit >= 0 ? 'income' : 'expense'}`}>
                {money(summary.grossProfit)}
              </Text>
            </View>
            <View className='stat-card'>
              <Text className='stat-label'>毛利率</Text>
              <Text className='stat-value'>{summary.grossMargin}%</Text>
            </View>
          </View>

          {categories.length > 0 && (
            <View className='card'>
              <Text className='card-title'>支出分类占比</Text>
              {categories.map(([name, amount]) => (
                <View className='bar-row' key={name}>
                  <View className='bar-head'>
                    <Text className='bar-name'>{name}</Text>
                    <Text className='bar-num'>{money(amount)}</Text>
                  </View>
                  <View className='bar-track'>
                    <View
                      className='bar-fill'
                      style={{ width: `${maxCategory ? (amount / maxCategory) * 100 : 0}%` }}
                    />
                  </View>
                  <Text className='bar-pct'>
                    {totalExpense ? ((amount / totalExpense) * 100).toFixed(1) : '0.0'}%
                  </Text>
                </View>
              ))}
            </View>
          )}

          {months.length > 0 && (
            <View className='card'>
              <Text className='card-title'>近 {months.length} 个月收支</Text>
              {months.map(([month, d]) => {
                const profit = d.income - d.expense;
                return (
                  <View className='month-row' key={month}>
                    <Text className='month-label'>{month}</Text>
                    <Text className='month-detail'>
                      收 {money(d.income)} · 支 {money(d.expense)}
                    </Text>
                    <Text className={`month-profit ${profit >= 0 ? 'income' : 'expense'}`}>
                      {money(profit)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          <View className='card'>
            <Text className='card-title'>AI 分析建议</Text>
            <Text className='ai-text'>{text}</Text>
            <Text className='ai-disclaimer'>
              内容由 AI 生成，仅供参考，不构成财务或投资建议。
            </Text>
          </View>
        </>
      )}

      <View className='bottom-gap' />
    </ScrollView>
  );
}
