import { View, Text, ScrollView, Input, Picker } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState, useCallback, useRef } from 'react';
import { projectApi, recordApi } from '../../services/api';
import CategoryTag from '../../components/CategoryTag';
import './index.scss';

interface ProjectDetail {
  id: string;
  name: string;
  industry: string;
  report_month: string;
  status: string;
  customer_id: string;
  created_at: string;
  updated_at: string;
}

interface ProjectStats {
  total_records: number;
  total_cost: number;
  total_income: number;
  gross_profit: number;
  gross_margin: number;
  cost_by_category: CostCategory[];
}

interface CostCategory {
  category_code: string;
  category_l2: string;
  total_amount: number;
}

interface RecordItem {
  id: string;
  merchant_name: string;
  amount: number;
  category_code: string;
  category_l2: string;
  invoice_date: string;
  direction: string;
  [key: string]: any;
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  active: { label: '进行中', className: 'status-active' },
  completed: { label: '已完成', className: 'status-completed' },
  archived: { label: '已归档', className: 'status-archived' },
};

const PAGE_SIZE = 20;

function formatAmount(val: number): string {
  const num = Number(val) || 0;
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

const MONTH_OPTIONS = generateMonths();

export default function Project() {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [incomeMonth, setIncomeMonth] = useState(0);
  const [incomeAmount, setIncomeAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const projectIdRef = useRef<string>('');

  Taro.useDidShow(() => {
    const params = Taro.getCurrentInstance().router?.params;
    if (params?.id) {
      projectIdRef.current = params.id;
      setPage(1);
      setRecords([]);
      loadProject(params.id);
      loadStats(params.id);
      loadRecords(params.id, 1);
    }
  });

  const loadProject = async (id: string) => {
    try {
      const res = await projectApi.getDetail(id);
      setProject(res as unknown as ProjectDetail);
    } catch {
      Taro.showToast({ title: '项目加载失败', icon: 'none' });
    }
  };

  const loadStats = async (id: string) => {
    try {
      const res = await projectApi.getStats(id);
      setStats(res as unknown as ProjectStats);
    } catch {
      // ignore
    }
  };

  const loadRecords = async (id: string, pageNum: number, append = false) => {
    if (pageNum === 1) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const res = await recordApi.getList(id, { page: pageNum, size: PAGE_SIZE }) as any;
      const items: RecordItem[] = res.items || res.data?.items || [];
      const total: number = res.total || res.data?.total || 0;
      if (append) {
        setRecords(prev => [...prev, ...items]);
      } else {
        setRecords(items);
      }
      setRecordsTotal(total);
      setPage(pageNum);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleLoadMore = useCallback(() => {
    if (loadingMore || !projectIdRef.current) return;
    const hasNext = page * PAGE_SIZE < recordsTotal;
    if (!hasNext) return;
    loadRecords(projectIdRef.current, page + 1, true);
  }, [page, recordsTotal, loadingMore]);

  const handleRecordClick = (record: RecordItem) => {
    const encodedData = encodeURIComponent(JSON.stringify(record));
    Taro.navigateTo({ url: `/pages/result/index?id=${record.id}&data=${encodedData}` });
  };

  const handleRecordLongPress = (record: RecordItem) => {
    Taro.showModal({
      title: '确认删除',
      content: `确定要删除「${record.merchant_name}」的记录吗？`,
      confirmColor: '#FF4D4F',
      success: async (res) => {
        if (res.confirm) {
          try {
            await recordApi.delete(record.id);
            Taro.showToast({ title: '已删除', icon: 'success' });
            setRecords(prev => prev.filter(r => r.id !== record.id));
            setRecordsTotal(prev => prev - 1);
            if (projectIdRef.current) {
              loadStats(projectIdRef.current);
            }
          } catch {
            Taro.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      },
    });
  };

  const handleAddIncome = () => {
    setIncomeMonth(0);
    setIncomeAmount('');
    setShowIncomeModal(true);
  };

  const handleSubmitIncome = async () => {
    if (!project || !incomeAmount) {
      Taro.showToast({ title: '请填写金额', icon: 'none' });
      return;
    }
    const amountYuan = parseFloat(incomeAmount);
    if (isNaN(amountYuan) || amountYuan <= 0) {
      Taro.showToast({ title: '请输入有效金额', icon: 'none' });
      return;
    }
    setSubmitting(true);
    try {
      await projectApi.addManualIncome(project.id, {
        month: MONTH_OPTIONS[incomeMonth],
        amount: amountYuan,
      });
      Taro.showToast({ title: '添加成功', icon: 'success' });
      setShowIncomeModal(false);
      loadStats(project.id);
      loadRecords(project.id, 1);
    } catch {
      Taro.showToast({ title: '添加失败', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewReport = () => {
    if (project) {
      Taro.navigateTo({ url: `/pages/report/index?projectId=${project.id}` });
    }
  };

  const handleUpload = () => {
    Taro.navigateTo({ url: '/pages/upload/index' });
  };

  const maxCategoryAmount = stats?.cost_by_category?.length
    ? Math.max(...stats.cost_by_category.map(c => c.total_amount))
    : 0;

  if (!project) {
    return (
      <View className='project-page project-page--loading'>
        <Text className='loading-text'>加载中...</Text>
      </View>
    );
  }

  const statusInfo = STATUS_MAP[project.status] || STATUS_MAP.active;

  return (
    <ScrollView
      className='project-page'
      scrollY
      onScrollToLower={handleLoadMore}
      lowerThreshold={200}
    >
      <View className='project-header'>
        <View className='header-top'>
          <Text className='project-name'>{project.name}</Text>
          <View className={`status-badge ${statusInfo.className}`}>
            <Text className='status-text'>{statusInfo.label}</Text>
          </View>
        </View>
        <View className='header-tags'>
          {project.industry ? <CategoryTag name={project.industry} /> : null}
          {project.report_month ? (
            <View className='month-tag'>
              <Text className='month-text'>{project.report_month}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {stats && (
        <View className='stats-section'>
          <View className='stats-grid'>
            <View className='stat-card stat-card--cost'>
              <Text className='stat-label'>总成本</Text>
              <Text className='stat-value stat-value--cost'>¥{formatAmount(stats.total_cost)}</Text>
            </View>
            <View className='stat-card stat-card--income'>
              <Text className='stat-label'>总收入</Text>
              <Text className='stat-value stat-value--income'>¥{formatAmount(stats.total_income)}</Text>
            </View>
            <View className='stat-card stat-card--profit'>
              <Text className='stat-label'>毛利润</Text>
              <Text className='stat-value stat-value--profit'>¥{formatAmount(stats.gross_profit)}</Text>
            </View>
            <View className='stat-card stat-card--margin'>
              <Text className='stat-label'>毛利率</Text>
              <Text className='stat-value stat-value--margin'>{stats.gross_margin.toFixed(1)}%</Text>
            </View>
          </View>
        </View>
      )}

      {stats && stats.cost_by_category && stats.cost_by_category.length > 0 && (
        <View className='category-section'>
          <Text className='section-title'>成本分类</Text>
          <View className='category-list'>
            {stats.cost_by_category.map((cat) => {
              const percent = maxCategoryAmount > 0
                ? (cat.total_amount / maxCategoryAmount) * 100
                : 0;
              return (
                <View className='category-item' key={cat.category_code}>
                  <View className='category-info'>
                    <CategoryTag name={cat.category_l2 || cat.category_code} />
                    <Text className='category-amount'>¥{formatAmount(cat.total_amount)}</Text>
                  </View>
                  <View className='category-bar-track'>
                    <View
                      className='category-bar-fill'
                      style={{ width: `${percent}%` }}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      <View className='action-section'>
        <View className='action-btn action-btn--income' onClick={handleAddIncome}>
          <Text className='action-btn-text'>添加收入</Text>
        </View>
        <View className='action-btn action-btn--report' onClick={handleViewReport}>
          <Text className='action-btn-text'>查看报表</Text>
        </View>
        <View className='action-btn action-btn--upload' onClick={handleUpload}>
          <Text className='action-btn-text'>上传票据</Text>
        </View>
      </View>

      <View className='records-section'>
        <View className='records-header'>
          <Text className='section-title'>票据记录</Text>
          <Text className='records-count'>共 {recordsTotal} 条</Text>
        </View>

        {records.length > 0 ? (
          <View className='records-list'>
            {records.map((record) => (
              <View
                key={record.id}
                className='record-item'
                onClick={() => handleRecordClick(record)}
                onLongPress={() => handleRecordLongPress(record)}
              >
                <View className='record-main'>
                  <Text className='record-merchant'>{record.merchant_name || '未知商户'}</Text>
                  <View className='record-meta'>
                    <CategoryTag name={record.category_l2 || record.category_code || '其他'} />
                    <Text className='record-date'>{record.invoice_date || ''}</Text>
                  </View>
                </View>
                <Text className='record-amount'>¥{formatAmount(record.amount)}</Text>
              </View>
            ))}
            {loadingMore && (
              <View className='loading-more'>
                <Text className='loading-more-text'>加载中...</Text>
              </View>
            )}
            {page * PAGE_SIZE >= recordsTotal && records.length > 0 && (
              <View className='no-more'>
                <Text className='no-more-text'>没有更多了</Text>
              </View>
            )}
          </View>
        ) : !loading ? (
          <View className='empty-state'>
            <Text className='empty-icon'>📋</Text>
            <Text className='empty-text'>暂无票据记录</Text>
          </View>
        ) : null}
      </View>

      {showIncomeModal && (
        <View className='modal-mask' onClick={() => setShowIncomeModal(false)}>
          <View className='modal-content' onClick={(e) => e.stopPropagation()}>
            <Text className='modal-title'>添加收入</Text>
            <View className='modal-field'>
              <Text className='modal-label'>月份</Text>
              <Picker
                mode='selector'
                range={MONTH_OPTIONS}
                value={incomeMonth}
                onChange={(e) => setIncomeMonth(Number(e.detail.value))}
              >
                <View className='modal-picker'>
                  <Text className='modal-picker-value'>{MONTH_OPTIONS[incomeMonth]}</Text>
                  <Text className='modal-picker-arrow'>▾</Text>
                </View>
              </Picker>
            </View>
            <View className='modal-field'>
              <Text className='modal-label'>金额（元）</Text>
              <Input
                className='modal-input'
                type='digit'
                value={incomeAmount}
                onInput={(e) => setIncomeAmount(e.detail.value)}
                placeholder='请输入收入金额'
              />
            </View>
            <View className='modal-actions'>
              <View
                className='modal-btn modal-btn--cancel'
                onClick={() => setShowIncomeModal(false)}
              >
                <Text className='modal-btn-text'>取消</Text>
              </View>
              <View
                className={`modal-btn modal-btn--confirm ${submitting ? 'modal-btn--disabled' : ''}`}
                onClick={submitting ? undefined : handleSubmitIncome}
              >
                <Text className='modal-btn-text'>{submitting ? '提交中...' : '确定'}</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}
