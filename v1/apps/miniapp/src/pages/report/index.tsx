import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState } from 'react';
import { projectApi, reportApi } from '../../services/api';
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

function formatAmount(val: number): string {
  const num = Number(val) || 0;
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPercent(val: number): string {
  return (Number(val) || 0).toFixed(1) + '%';
}

export default function Report() {
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  Taro.useDidShow(() => {
    const params = Taro.getCurrentInstance().router?.params;
    if (params?.projectId) {
      loadData(params.projectId);
    }
  });

  const loadData = async (projectId: string) => {
    setLoading(true);
    try {
      const [projectRes, statsRes] = await Promise.all([
        projectApi.getDetail(projectId),
        projectApi.getStats(projectId),
      ]);
      setProject(projectRes as unknown as ProjectInfo);
      setStats(statsRes as unknown as StatsData);
    } catch {
      Taro.showToast({ title: '加载报表失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = async () => {
    const params = Taro.getCurrentInstance().router?.params;
    if (!params?.projectId) return;
    try {
      Taro.showLoading({ title: '导出中...' });
      const token = Taro.getStorageSync('token');
      const exportUrl = `${process.env.TARO_APP_API_URL || 'http://localhost:8000'}/api/projects/${params.projectId}/report/export?fmt=csv`;
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
    const params = Taro.getCurrentInstance().router?.params;
    if (!params?.projectId) return;
    try {
      Taro.showLoading({ title: '生成中...' });
      const res = await reportApi.shareReport(params.projectId);
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

  return (
    <View className='report-page'>
      <View className='project-header'>
        <Text className='project-name'>{project?.name || '项目报表'}</Text>
        <Text className='project-records'>共 {stats.total_records} 条记录</Text>
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
              return (
                <View key={cat.category_code || idx} className='bar-item'>
                  <View className='bar-label'>
                    <CategoryTag name={cat.category_l2} />
                  </View>
                  <View className='bar-track'>
                    <View
                      className='bar-fill'
                      style={{ width: `${barWidth}%` }}
                    />
                  </View>
                  <Text className='bar-amount'>¥{formatAmount(cat.total_amount)}</Text>
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
