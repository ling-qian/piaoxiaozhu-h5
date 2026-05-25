import { View, Text, Button, Input, Picker } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState, useMemo } from 'react';
import { recordApi, projectApi } from '../../services/api';
import { useStore } from '../../store';
import CategoryTag from '../../components/CategoryTag';
import './index.scss';

const CATEGORIES = [
  { code: 'c01', name: '中式正餐', l1: '餐饮', l2: '中式正餐' },
  { code: 'c02', name: '火锅烧烤', l1: '餐饮', l2: '火锅烧烤' },
  { code: 'c03', name: '快餐简餐', l1: '餐饮', l2: '快餐简餐' },
  { code: 'c04', name: '烘焙甜品', l1: '餐饮', l2: '烘焙甜品' },
  { code: 'c05', name: '饮品小食', l1: '餐饮', l2: '饮品小食' },
  { code: 'c06', name: '团餐食堂', l1: '餐饮', l2: '团餐食堂' },
];

interface RecordData {
  id: string;
  merchant_name: string;
  amount: number;
  tax_amount: number;
  invoice_date: string;
  category_code: string;
  category_l1: string;
  category_l2: string;
  confidence: number;
}

interface ProjectItem {
  id: string;
  name: string;
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.9) return '#52C41A';
  if (confidence >= 0.7) return '#FAAD14';
  return '#FF4D4F';
}

function getConfidenceText(confidence: number): string {
  if (confidence >= 0.9) return '高';
  if (confidence >= 0.7) return '中';
  return '低';
}

function findCategoryIndex(code: string): number {
  const idx = CATEGORIES.findIndex((c) => c.code === code);
  return idx >= 0 ? idx : 0;
}

function formatAmount(val: number): string {
  return (Number(val) || 0).toFixed(2);
}

function parseAmountInput(input: string): number {
  const val = parseFloat(input);
  if (isNaN(val)) return 0;
  return Math.round(val * 100) / 100;
}

export default function Result() {
  const params = Taro.getCurrentInstance().router?.params || {};
  const isManual = params.mode === 'manual';

  const initialRecord = useMemo<RecordData | null>(() => {
    if (isManual || !params.data) return null;
    try {
      return JSON.parse(decodeURIComponent(params.data));
    } catch {
      return null;
    }
  }, []);

  const [record, setRecord] = useState<RecordData | null>(initialRecord);
  const [categoryIdx, setCategoryIdx] = useState<number>(
    initialRecord ? findCategoryIndex(initialRecord.category_code) : 0,
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { projects, fetchProjects } = useStore();
  const [projectList, setProjectList] = useState<ProjectItem[]>(projects || []);
  const [selectedProjectIdx, setSelectedProjectIdx] = useState(0);
  const [form, setForm] = useState({
    merchant_name: '',
    amount: '',
    tax_amount: '',
    invoice_date: '',
  });
  const [manualCategoryIdx, setManualCategoryIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  Taro.useDidShow(() => {
    if (isManual) {
      fetchProjects().then(() => {
        const store = useStore.getState();
        setProjectList(store.projects);
        if (store.currentProject) {
          const idx = store.projects.findIndex((p) => p.id === store.currentProject!.id);
          if (idx >= 0) setSelectedProjectIdx(idx);
        }
      });
    }
  });

  const updateField = (field: keyof RecordData, value: any) => {
    if (!record) return;
    setRecord({ ...record, [field]: value });
  };

  const handleCategoryChange = (e: any) => {
    const idx = Number(e.detail.value);
    setCategoryIdx(idx);
    if (record) {
      setRecord({
        ...record,
        category_code: CATEGORIES[idx].code,
        category_l1: CATEGORIES[idx].l1,
        category_l2: CATEGORIES[idx].l2,
      });
    }
  };

  const handleSave = async () => {
    if (!record) return;
    setSaving(true);
    try {
      await recordApi.update(record.id, {
        merchant_name: record.merchant_name,
        amount: record.amount,
        tax_amount: record.tax_amount,
        invoice_date: record.invoice_date,
        category_code: record.category_code,
        category_l1: record.category_l1,
        category_l2: record.category_l2,
      });
      Taro.showToast({ title: '保存成功', icon: 'success' });
    } catch {
      Taro.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!record) return;
    const { confirm } = await Taro.showModal({
      title: '确认删除',
      content: '删除后不可恢复，确定要删除这条记录吗？',
      confirmColor: '#FF4D4F',
    });
    if (!confirm) return;

    setDeleting(true);
    try {
      await recordApi.delete(record.id);
      Taro.showToast({ title: '已删除', icon: 'success' });
      setTimeout(() => Taro.navigateBack(), 800);
    } catch {
      Taro.showToast({ title: '删除失败', icon: 'none' });
    } finally {
      setDeleting(false);
    }
  };

  const handleManualCategoryChange = (e: any) => {
    setManualCategoryIdx(Number(e.detail.value));
  };

  const handleProjectChange = (e: any) => {
    setSelectedProjectIdx(Number(e.detail.value));
  };

  const handleFormInput = (field: keyof typeof form, value: string) => {
    setForm({ ...form, [field]: value });
  };

  const handleSubmit = async () => {
    if (!projectList[selectedProjectIdx]) {
      Taro.showToast({ title: '请选择项目', icon: 'none' });
      return;
    }
    if (!form.merchant_name.trim()) {
      Taro.showToast({ title: '请输入商户名称', icon: 'none' });
      return;
    }

    setSubmitting(true);
    try {
      const cat = CATEGORIES[manualCategoryIdx];
      await recordApi.create({
        project_id: projectList[selectedProjectIdx].id,
        direction: 'cost',
        merchant_name: form.merchant_name.trim(),
        amount: parseAmountInput(form.amount),
        tax_amount: parseAmountInput(form.tax_amount),
        invoice_date: form.invoice_date,
        category_code: cat.code,
        category_l1: cat.l1,
        category_l2: cat.l2,
      });
      Taro.showToast({ title: '提交成功', icon: 'success' });
      setTimeout(() => Taro.navigateBack(), 800);
    } catch {
      Taro.showToast({ title: '提交失败', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  if (isManual) {
    return (
      <View className='result-page'>
        <View className='section-title'>手动录入</View>

        <View className='result-card'>
          <View className='field-item'>
            <Text className='field-label'>归属项目</Text>
            <Picker
              mode='selector'
              range={projectList.map((p) => p.name)}
              value={selectedProjectIdx}
              onChange={handleProjectChange}
            >
              <View className='field-picker-value'>
                <Text className={projectList.length > 0 ? 'field-value' : 'field-value placeholder'}>
                  {projectList.length > 0 ? projectList[selectedProjectIdx]?.name || '请选择项目' : '暂无项目'}
                </Text>
                <Text className='picker-arrow'>▸</Text>
              </View>
            </Picker>
          </View>

          <View className='field-item'>
            <Text className='field-label'>商户名称</Text>
            <Input
              className='field-input'
              value={form.merchant_name}
              onInput={(e) => handleFormInput('merchant_name', e.detail.value)}
              placeholder='请输入商户名称'
            />
          </View>

          <View className='field-item'>
            <Text className='field-label'>金额（元）</Text>
            <Input
              className='field-input'
              type='digit'
              value={form.amount}
              onInput={(e) => handleFormInput('amount', e.detail.value)}
              placeholder='0.00'
            />
          </View>

          <View className='field-item'>
            <Text className='field-label'>税额（元）</Text>
            <Input
              className='field-input'
              type='digit'
              value={form.tax_amount}
              onInput={(e) => handleFormInput('tax_amount', e.detail.value)}
              placeholder='0.00'
            />
          </View>

          <View className='field-item'>
            <Text className='field-label'>开票日期</Text>
            <Picker mode='date' value={form.invoice_date || '2025-01-01'} onChange={(e) => handleFormInput('invoice_date', e.detail.value)}>
              <View className='field-picker-value'>
                <Text className={form.invoice_date ? 'field-value' : 'field-value placeholder'}>
                  {form.invoice_date || '请选择日期'}
                </Text>
                <Text className='picker-arrow'>▸</Text>
              </View>
            </Picker>
          </View>

          <View className='field-item'>
            <Text className='field-label'>分类</Text>
            <Picker
              mode='selector'
              range={CATEGORIES.map((c) => c.name)}
              value={manualCategoryIdx}
              onChange={handleManualCategoryChange}
            >
              <View className='field-picker-value'>
                <CategoryTag name={CATEGORIES[manualCategoryIdx].name} />
                <Text className='picker-arrow'>▸</Text>
              </View>
            </Picker>
          </View>
        </View>

        <View className='action-bar'>
          <Button className='btn-primary' onClick={handleSubmit} loading={submitting}>
            提交
          </Button>
        </View>
      </View>
    );
  }

  if (!record) {
    return (
      <View className='result-page loading'>
        <Text className='loading-text'>加载中...</Text>
      </View>
    );
  }

  const confidencePct = (record.confidence * 100).toFixed(0);

  return (
    <View className='result-page'>
      <View className='confidence-bar'>
        <View className='confidence-info'>
          <Text className='confidence-label'>识别置信度</Text>
          <Text className='confidence-value' style={{ color: getConfidenceColor(record.confidence) }}>
            {getConfidenceText(record.confidence)}（{confidencePct}%）
          </Text>
        </View>
        <View className='confidence-track'>
          <View
            className='confidence-fill'
            style={{
              width: `${confidencePct}%`,
              backgroundColor: getConfidenceColor(record.confidence),
            }}
          />
        </View>
      </View>

      <View className='result-card'>
        <View className='card-header'>
          <Text className='card-title'>票据信息</Text>
        </View>

        <View className='field-item'>
          <Text className='field-label'>商户名称</Text>
          <Input
            className='field-input'
            value={record.merchant_name}
            onInput={(e) => updateField('merchant_name', e.detail.value)}
            placeholder='请输入商户名称'
          />
        </View>

        <View className='field-item'>
          <Text className='field-label'>金额（元）</Text>
          <Input
            className='field-input'
            type='digit'
            value={formatAmount(record.amount)}
            onInput={(e) => updateField('amount', parseAmountInput(e.detail.value))}
            placeholder='0.00'
          />
        </View>

        <View className='field-item'>
          <Text className='field-label'>税额（元）</Text>
          <Input
            className='field-input'
            type='digit'
            value={formatAmount(record.tax_amount)}
            onInput={(e) => updateField('tax_amount', parseAmountInput(e.detail.value))}
            placeholder='0.00'
          />
        </View>

        <View className='field-item'>
          <Text className='field-label'>开票日期</Text>
          <Picker mode='date' value={record.invoice_date || '2025-01-01'} onChange={(e) => updateField('invoice_date', e.detail.value)}>
            <View className='field-picker-value'>
              <Text className={record.invoice_date ? 'field-value' : 'field-value placeholder'}>
                {record.invoice_date || '请选择日期'}
              </Text>
              <Text className='picker-arrow'>▸</Text>
            </View>
          </Picker>
        </View>

        <View className='field-item'>
          <Text className='field-label'>分类</Text>
          <Picker
            mode='selector'
            range={CATEGORIES.map((c) => c.name)}
            value={categoryIdx}
            onChange={handleCategoryChange}
          >
            <View className='field-picker-value'>
              <CategoryTag name={CATEGORIES[categoryIdx].name} />
              <Text className='picker-arrow'>▸</Text>
            </View>
          </Picker>
        </View>
      </View>

      <View className='action-bar'>
        <Button className='btn-primary' onClick={handleSave} loading={saving}>
          保存修改
        </Button>
        <Button className='btn-danger' onClick={handleDelete} loading={deleting}>
          删除记录
        </Button>
      </View>
    </View>
  );
}
