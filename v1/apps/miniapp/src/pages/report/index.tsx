import { View, Text, Picker } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState, useMemo } from 'react';
import { projectApi, reportApi } from '../../services/api';
import { useStore } from '../../store';
import CategoryTag from '../../components/CategoryTag';
import './index.scss';

interface ProjectInfo {
  id: string;
  name: string;
}

interface StatsData {
  total_records: number;
  total_cost: number;
  total_income: number;
  gross_profit: number;
  gross_margin: number;
  cost_by_category: CategoryCost[];
}

interface CategoryCost {
  category_code: string;
  category_l2: string;
  total_amount: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  '食材': '#FF6B35', '房租': '#722ED1', '工资': '#1890FF', '水电': '#597EF7',
  '平台佣金': '#FA541C', '广告': '#EB2F96', '办公': '#52C41A', '其他': '#8C8C8C',
  'food_material': '#FF6B35', 'rent': '#722ED1', 'salary': '#1890FF', 'utilities': '#597EF7',
  'platform_fee': '#FA541C', 'advertising': '#EB2F96', 'office': '#52C41A', 'other': '#8C8C8C',
};

function formatAmount(val: number): string {
  const num = Number(val) || 0;
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPercent(val: number): string {
  return (Number(val) || 0).toFixed(1) + '%';
}

function normalizeCostByCategory(data: any): CategoryCost[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    return Object.entries(data).map(([name, amount]) => ({
      category_code: name,
      category_l2: name,
      total_amount: Number(amount) || 0,
    }));
  }
  return [];
}

function generateMonths(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    months.push(`${y}-${m}`);
  }
  return months;
}

function getMonthLabel(month: string): string {
  const [y, m] = month.split('-');
  return `${y}年${parseInt(m)}月`;
}

export default function Report() {
  const { projects, currentProject } = useStore();
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  const months = useMemo(() => generateMonths(), []);
  const [monthIdx, setMonthIdx] = useState(0);

  const projectId = Taro.getCurrentInstance().router?.params?.projectId || currentProject?.id || '';

  Taro.useDidShow(() => {
    if (projectId) {
      loadData(projectId);
    }
  });

  const loadData = async (pid: string) => {
    setLoading(true);
    try {
      const [projectRes, statsRes] = await Promise.all([
        projectApi.getDetail(pid),
        projectApi.getStats(pid),
      ]);
      setProject(projectRes as unknown as ProjectInfo);
      const rawStats = statsRes as any;
      const normalizedStats: StatsData = {
        total_records: rawStats.total_records || 0,
        total_cost: Number(rawStats.total_cost) || 0,
        total_income: Number(rawStats.total_income) || 0,
        gross_profit: Number(rawStats.gross_profit) || 0,
        gross_margin: Number(rawStats.gross_margin) || 0,
        cost_by_category: normalizeCostByCategory(rawStats.cost_by_category),
      };
      setStats(normalizedStats);
    } catch {
      Taro.showToast({ title: '加载报表失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  };

  const handleMonthChange = (e: any) => {
    const idx = Number(e.detail.value);
    setMonthIdx(idx);
  };

  const handleExportCsv = async () => {
    if (!projectId) return;
    try {
      Taro.showLoading({ title: '导出中...' });
      const token = Taro.getStorageSync('token');
      const exportUrl = `${process.env.TARO_APP_API_URL || 'http://localhost:8000'}/api/projects/${projectId}/report/export?fmt=csv`;
      Taro.downloadFile({
        url: exportUrl,
        header: { Authorization: `Bearer ${token}` },
        success: (downloadRes) => {
          Taro.hideLoading();
          if (downloadRes.statusCode === 200) {
            Taro.openDocument({
              filePath: downloadRes.tempFilePath,
              showMenu: true,
            });
          } else {
            Taro.showToast({ title: '导出失败', icon: 'none' });
          }
        },
        fail: () => {
          Taro.hideLoading();
          Taro.showToast({ title: '导出失败', icon: 'none' });
        },
      });
    } catch {
      Taro.hideLoading();
      Taro.showToast({ title: '导出失败', icon: 'none' });
    }
  };

  const handleShare = async () => {
    if (!projectId) return;
    try {
      Taro.showLoading({ title: '生成中...' });
      const res = await reportApi.shareReport(projectId);
      Taro.hideLoading();
      const shareToken = (res as any)?.share_token;
      const shareUrl = (res as any)?.share_url;
      if (shareUrl) {
        Taro.setClipboardData({
          data: shareUrl,
          success: () => {
            Taro.showToast({ title: '分享链接已复制', icon: 'success' });
          },
        });
      } else if (shareToken) {
        Taro.setClipboardData({
          data: shareToken,
          success: () => {
            Taro.showToast({ title: '分享口令已复制', icon: 'success' });
          },
        });
      } else {
        Taro.showToast({ title: '分享链接已生成', icon: 'success' });
      }
    } catch {
      Taro.hideLoading();
      Taro.showToast({ title: '分享失败', icon: 'none' });
    }
  };

  if (loading) {
    return (
      <View className='report-page loading'>
        <Text className='loading-text'>加载中...</Text>
      </View>
    );
  }

  if (!stats) {
    return (
      <View className='report-page loading'>
        <Text className='loading-text'>暂无数据</Text>
      </View>
    );
  }

  const isProfit = stats.gross_profit >= 0;
  const maxCategoryAmount = stats.cost_by_category?.length
    ? Math.max(...stats.cost_by_category.map((c) => c.total_amount))
    : 0;
  const totalCost = stats.total_cost || 1;

  return (
    <View className='report-page'>
      <View className='project-header'>
        <View className='header-top'>
          <View className='header-info'>
            <Text className='project-name'>{project?.name || '项目报表'}</Text>
            <Text className='project-records'>共 {stats.total_records} 条记录</Text>
          </View>
          <Picker mode='selector' range={months.map(getMonthLabel)} value={monthIdx} onChange={handleMonthChange}>
            <View className='month-selector'>
              <Text className='month-text'>{getMonthLabel(months[monthIdx])}</Text>
              <Text className='month-arrow'>▾</Text>
            </View>
          </Picker>
        </View>
      </View>

      <View className='profit-card'>
        <View className='profit-main'>
          <Text className='profit-label'>毛利润</Text>
          <Text className={`profit-value ${isProfit ? 'positive' : 'negative'}`}>
            {isProfit ? '' : '-'}¥{formatAmount(Math.abs(stats.gross_profit))}
          </Text>
        </View>
        <View className='profit-margin'>
          <Text className='margin-label'>毛利率</Text>
          <Text className={`margin-value ${isProfit ? 'positive' : 'negative'}`}>
            {formatPercent(stats.gross_margin)}
          </Text>
        </View>
        <View className='profit-detail'>
          <View className='detail-item'>
            <Text className='detail-label'>总收入</Text>
            <Text className='detail-value income'>¥{formatAmount(stats.total_income)}</Text>
          </View>
          <View className='detail-divider' />
          <View className='detail-item'>
            <Text className='detail-label'>总成本</Text>
            <Text className='detail-value cost'>¥{formatAmount(stats.total_cost)}</Text>
          </View>
        </View>
      </View>

      {stats.cost_by_category?.length > 0 && (
        <View className='category-section'>
          <Text className='section-title'>成本分布</Text>
          <View className='bar-chart'>
            {stats.cost_by_category.map((cat, idx) => {
              const barWidth = maxCategoryAmount > 0
                ? (cat.total_amount / maxCategoryAmount) * 100
                : 0;
              const pct = totalCost > 0
                ? ((cat.total_amount / totalCost) * 100).toFixed(1)
                : '0.0';
              const barColor = CATEGORY_COLORS[cat.category_l2] || CATEGORY_COLORS[cat.category_code] || '#8C8C8C';
              return (
                <View key={cat.category_code || idx} className='bar-item'>
                  <View className='bar-label'>
                    <CategoryTag name={cat.category_l2} code={cat.category_code} />
                  </View>
                  <View className='bar-track'>
                    <View
                      className='bar-fill'
                      style={{ width: `${barWidth}%`, background: `linear-gradient(90deg, ${barColor}60, ${barColor})` }}
                    />
                  </View>
                  <View className='bar-right'>
                    <Text className='bar-amount'>¥{formatAmount(cat.total_amount)}</Text>
                    <Text className='bar-pct' style={{ color: barColor }}>{pct}%</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      <View className='action-bar'>
        <View className='action-btn export' onClick={handleExportCsv}>
          <Text className='action-icon'>📄</Text>
          <Text className='action-text'>导出 CSV</Text>
        </View>
        <View className='action-btn share' onClick={handleShare}>
          <Text className='action-icon'>🔗</Text>
          <Text className='action-text'>分享报表</Text>
        </View>
      </View>
    </View>
  );
}
