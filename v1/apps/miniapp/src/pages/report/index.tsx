import { View, Text, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState } from 'react';
import { reportApi } from '../../services/api';
import './index.scss';

interface ReportData {
  totalIncome: number;
  totalCost: number;
  profit: number;
  margin: number;
  categories: CategoryItem[];
}

interface CategoryItem {
  name: string;
  amount: number;
  count: number;
  percentage: number;
  color: string;
}

export default function Report() {
  const [report, setReport] = useState<ReportData | null>(null);

  Taro.useDidShow(() => {
    const params = Taro.getCurrentInstance().router?.params;
    if (params?.projectId) {
      loadReport(params.projectId);
    }
  });

  const loadReport = async (projectId: string) => {
    try {
      const res = await reportApi.getProjectReport(projectId);
      setReport(res.data);
    } catch {
      Taro.showToast({ title: '加载报表失败', icon: 'none' });
    }
  };

  const handleExport = async () => {
    const params = Taro.getCurrentInstance().router?.params;
    if (!params?.projectId) return;
    try {
      const res = await reportApi.exportReport(params.projectId, 'excel');
      Taro.showToast({ title: '导出成功', icon: 'success' });
    } catch {
      Taro.showToast({ title: '导出失败', icon: 'none' });
    }
  };

  const handleShare = () => {
    Taro.showShareMenu({
      withShareTicket: true,
    });
  };

  if (!report) {
    return (
      <View className='report-page loading'>
        <Text>加载中...</Text>
      </View>
    );
  }

  return (
    <View className='report-page'>
      <View className='summary-grid'>
        <View className='summary-item income'>
          <Text className='summary-label'>总收入</Text>
          <Text className='summary-value'>¥{report.totalIncome.toFixed(2)}</Text>
        </View>
        <View className='summary-item cost'>
          <Text className='summary-label'>总成本</Text>
          <Text className='summary-value'>¥{report.totalCost.toFixed(2)}</Text>
        </View>
        <View className='summary-item profit'>
          <Text className='summary-label'>利润</Text>
          <Text className='summary-value'>¥{report.profit.toFixed(2)}</Text>
        </View>
        <View className='summary-item margin'>
          <Text className='summary-label'>利润率</Text>
          <Text className='summary-value'>{(report.margin * 100).toFixed(1)}%</Text>
        </View>
      </View>

      <View className='category-section'>
        <Text className='section-title'>分类明细</Text>
        <View className='category-table'>
          <View className='table-header'>
            <Text className='col-name'>分类</Text>
            <Text className='col-amount'>金额</Text>
            <Text className='col-count'>数量</Text>
            <Text className='col-percent'>占比</Text>
          </View>
          {report.categories.map((cat, idx) => (
            <View key={idx} className='table-row'>
              <View className='col-name'>
                <View className='color-dot' style={{ backgroundColor: cat.color }} />
                <Text>{cat.name}</Text>
              </View>
              <Text className='col-amount'>¥{cat.amount.toFixed(2)}</Text>
              <Text className='col-count'>{cat.count}</Text>
              <Text className='col-percent'>{(cat.percentage * 100).toFixed(1)}%</Text>
            </View>
          ))}
        </View>
      </View>

      <View className='category-chart'>
        <Text className='section-title'>成本分布</Text>
        <View className='bar-chart'>
          {report.categories.map((cat, idx) => (
            <View key={idx} className='bar-item'>
              <Text className='bar-label'>{cat.name}</Text>
              <View className='bar-track'>
                <View
                  className='bar-fill'
                  style={{
                    width: `${cat.percentage * 100}%`,
                    backgroundColor: cat.color,
                  }}
                />
              </View>
              <Text className='bar-value'>{(cat.percentage * 100).toFixed(0)}%</Text>
            </View>
          ))}
        </View>
      </View>

      <View className='action-bar'>
        <Button className='btn-export' onClick={handleExport}>
          📥 导出报表
        </Button>
        <Button className='btn-share' onClick={handleShare} openType='share'>
          🔗 分享
        </Button>
      </View>
    </View>
  );
}
