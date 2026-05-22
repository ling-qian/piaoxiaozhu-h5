import { View, Text, Button, Input, Picker } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState } from 'react';
import { projectApi, invoiceApi } from '../../services/api';
import CategoryTag from '../../components/CategoryTag';
import './index.scss';

interface RecordItem {
  id: string;
  merchant: string;
  date: string;
  amount: string;
  category: string;
  type: string;
}

interface ProjectDetail {
  id: string;
  name: string;
  description: string;
  recordCount: number;
  totalIncome: number;
  totalCost: number;
  profit: number;
  createdAt: string;
}

const CATEGORIES = ['全部', '餐饮', '交通', '住宿', '办公用品', '通讯', '差旅', '会议', '其他'];

export default function Project() {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [filterIdx, setFilterIdx] = useState(0);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeDesc, setIncomeDesc] = useState('');

  Taro.useDidShow(() => {
    const params = Taro.getCurrentInstance().router?.params;
    if (params?.id) {
      loadProject(params.id);
    }
  });

  const loadProject = async (id: string) => {
    try {
      const res = await projectApi.getDetail(id);
      setProject(res.data);
      loadRecords(id);
    } catch {
      Taro.showToast({ title: '加载失败', icon: 'none' });
    }
  };

  const loadRecords = async (id: string) => {
    try {
      const category = CATEGORIES[filterIdx] === '全部' ? undefined : CATEGORIES[filterIdx];
      const res = await invoiceApi.getList({ projectId: id });
      setRecords(res.data.list || []);
    } catch {
      // ignore
    }
  };

  const handleFilterChange = (e) => {
    setFilterIdx(Number(e.detail.value));
  };

  const handleRecordClick = (id: string) => {
    Taro.navigateTo({ url: `/pages/result/index?id=${id}` });
  };

  const handleViewReport = () => {
    if (project) {
      Taro.navigateTo({ url: `/pages/report/index?projectId=${project.id}` });
    }
  };

  const handleAddIncome = () => {
    setShowIncomeModal(true);
  };

  const handleSubmitIncome = async () => {
    if (!project || !incomeAmount) return;
    try {
      await projectApi.addManualIncome(project.id, {
        amount: parseFloat(incomeAmount),
        description: incomeDesc || '手动录入收入',
      });
      Taro.showToast({ title: '添加成功', icon: 'success' });
      setShowIncomeModal(false);
      setIncomeAmount('');
      setIncomeDesc('');
      loadProject(project.id);
    } catch {
      Taro.showToast({ title: '添加失败', icon: 'none' });
    }
  };

  if (!project) {
    return (
      <View className='project-page loading'>
        <Text>加载中...</Text>
      </View>
    );
  }

  return (
    <View className='project-page'>
      <View className='project-header'>
        <Text className='project-name'>{project.name}</Text>
        {project.description ? (
          <Text className='project-desc'>{project.description}</Text>
        ) : null}
        <Text className='project-date'>创建于 {project.createdAt}</Text>
      </View>

      <View className='summary-cards'>
        <View className='summary-card income'>
          <Text className='summary-label'>总收入</Text>
          <Text className='summary-value'>¥{project.totalIncome.toFixed(2)}</Text>
        </View>
        <View className='summary-card cost'>
          <Text className='summary-label'>总成本</Text>
          <Text className='summary-value'>¥{project.totalCost.toFixed(2)}</Text>
        </View>
        <View className='summary-card profit'>
          <Text className='summary-label'>利润</Text>
          <Text className='summary-value'>¥{project.profit.toFixed(2)}</Text>
        </View>
      </View>

      <View className='action-row'>
        <Button className='action-btn' onClick={handleAddIncome}>
          <Text className='action-icon'>💰</Text>
          <Text>录入收入</Text>
        </Button>
        <Button className='action-btn primary' onClick={handleViewReport}>
          <Text className='action-icon'>📊</Text>
          <Text>查看报表</Text>
        </Button>
      </View>

      <View className='record-section'>
        <View className='record-header'>
          <Text className='record-title'>票据记录 ({project.recordCount})</Text>
          <Picker mode='selector' range={CATEGORIES} value={filterIdx} onChange={handleFilterChange}>
            <View className='filter-btn'>
              <Text>{CATEGORIES[filterIdx]}</Text>
              <Text className='filter-arrow'>▼</Text>
            </View>
          </Picker>
        </View>

        {records.length > 0 ? (
          <View className='record-list'>
            {records.map((record) => (
              <View
                key={record.id}
                className='record-item'
                onClick={() => handleRecordClick(record.id)}
              >
                <View className='record-left'>
                  <Text className='record-merchant'>{record.merchant}</Text>
                  <View className='record-meta'>
                    <Text className='record-date'>{record.date}</Text>
                    <CategoryTag name={record.category} />
                  </View>
                </View>
                <Text className='record-amount'>¥{record.amount}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View className='empty-state'>
            <Text className='empty-text'>暂无票据记录</Text>
          </View>
        )}
      </View>

      {showIncomeModal && (
        <View className='modal-mask'>
          <View className='modal-content'>
            <Text className='modal-title'>录入收入</Text>
            <View className='modal-field'>
              <Text className='modal-label'>金额</Text>
              <Input
                className='modal-input'
                type='digit'
                value={incomeAmount}
                onInput={(e) => setIncomeAmount(e.detail.value)}
                placeholder='请输入收入金额'
              />
            </View>
            <View className='modal-field'>
              <Text className='modal-label'>说明</Text>
              <Input
                className='modal-input'
                value={incomeDesc}
                onInput={(e) => setIncomeDesc(e.detail.value)}
                placeholder='请输入收入说明（选填）'
              />
            </View>
            <View className='modal-actions'>
              <Button className='modal-btn cancel' onClick={() => setShowIncomeModal(false)}>
                取消
              </Button>
              <Button className='modal-btn confirm' onClick={handleSubmitIncome}>
                确定
              </Button>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
