import { View, Text, Button, Input, Picker } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState } from 'react';
import { invoiceApi, categoryApi } from '../../services/api';
import CategoryTag from '../../components/CategoryTag';
import './index.scss';

interface InvoiceDetail {
  id: string;
  merchant: string;
  date: string;
  amount: string;
  tax: string;
  totalAmount: string;
  category: string;
  confidence: number;
  imageUrl: string;
  type: string;
}

const CATEGORIES = [
  '餐饮', '交通', '住宿', '办公用品', '通讯',
  '差旅', '会议', '培训', '广告', '维修',
  '水电费', '其他',
];

export default function Result() {
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [categoryIdx, setCategoryIdx] = useState(0);
  const [saving, setSaving] = useState(false);

  Taro.useDidShow(() => {
    const params = Taro.getCurrentInstance().router?.params;
    if (params?.id) {
      loadDetail(params.id);
    }
  });

  const loadDetail = async (id: string) => {
    try {
      const res = await invoiceApi.getDetail(id);
      const data = res.data;
      setDetail(data);
      const idx = CATEGORIES.indexOf(data.category);
      setCategoryIdx(idx >= 0 ? idx : CATEGORIES.length - 1);
    } catch {
      Taro.showToast({ title: '加载失败', icon: 'none' });
    }
  };

  const handleFieldChange = (field: string, value: string) => {
    if (detail) {
      setDetail({ ...detail, [field]: value });
    }
  };

  const handleCategoryChange = (e) => {
    const idx = Number(e.detail.value);
    setCategoryIdx(idx);
    if (detail) {
      setDetail({ ...detail, category: CATEGORIES[idx] });
    }
  };

  const handleSave = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      await invoiceApi.update(detail.id, {
        merchant: detail.merchant,
        date: detail.date,
        amount: detail.amount,
        tax: detail.tax,
        category: detail.category,
      });
      Taro.showToast({ title: '保存成功', icon: 'success' });
      setEditing(false);
    } catch {
      Taro.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      setSaving(false);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return '#52C41A';
    if (confidence >= 0.7) return '#FAAD14';
    return '#FF4D4F';
  };

  const getConfidenceText = (confidence: number) => {
    if (confidence >= 0.9) return '高';
    if (confidence >= 0.7) return '中';
    return '低';
  };

  if (!detail) {
    return (
      <View className='result-page loading'>
        <Text>加载中...</Text>
      </View>
    );
  }

  return (
    <View className='result-page'>
      <View className='confidence-bar'>
        <View className='confidence-info'>
          <Text className='confidence-label'>识别置信度</Text>
          <Text
            className='confidence-value'
            style={{ color: getConfidenceColor(detail.confidence) }}
          >
            {getConfidenceText(detail.confidence)} ({(detail.confidence * 100).toFixed(0)}%)
          </Text>
        </View>
        <View className='confidence-track'>
          <View
            className='confidence-fill'
            style={{
              width: `${detail.confidence * 100}%`,
              backgroundColor: getConfidenceColor(detail.confidence),
            }}
          />
        </View>
      </View>

      <View className='result-card'>
        <View className='card-header'>
          <Text className='card-title'>票据信息</Text>
          <Text className='card-type'>{detail.type}</Text>
        </View>

        <View className='field-group'>
          <View className='field-item'>
            <Text className='field-label'>销售方</Text>
            {editing ? (
              <Input
                className='field-input'
                value={detail.merchant}
                onInput={(e) => handleFieldChange('merchant', e.detail.value)}
                placeholder='请输入销售方名称'
              />
            ) : (
              <Text className='field-value'>{detail.merchant}</Text>
            )}
          </View>

          <View className='field-item'>
            <Text className='field-label'>开票日期</Text>
            {editing ? (
              <Input
                className='field-input'
                value={detail.date}
                onInput={(e) => handleFieldChange('date', e.detail.value)}
                placeholder='YYYY-MM-DD'
              />
            ) : (
              <Text className='field-value'>{detail.date}</Text>
            )}
          </View>

          <View className='field-item'>
            <Text className='field-label'>金额</Text>
            {editing ? (
              <Input
                className='field-input'
                type='digit'
                value={detail.amount}
                onInput={(e) => handleFieldChange('amount', e.detail.value)}
                placeholder='请输入金额'
              />
            ) : (
              <Text className='field-value amount'>¥{detail.amount}</Text>
            )}
          </View>

          <View className='field-item'>
            <Text className='field-label'>税额</Text>
            {editing ? (
              <Input
                className='field-input'
                type='digit'
                value={detail.tax}
                onInput={(e) => handleFieldChange('tax', e.detail.value)}
                placeholder='请输入税额'
              />
            ) : (
              <Text className='field-value'>¥{detail.tax}</Text>
            )}
          </View>

          <View className='field-item'>
            <Text className='field-label'>价税合计</Text>
            <Text className='field-value total'>¥{detail.totalAmount}</Text>
          </View>

          <View className='field-item'>
            <Text className='field-label'>分类</Text>
            {editing ? (
              <Picker mode='selector' range={CATEGORIES} value={categoryIdx} onChange={handleCategoryChange}>
                <View className='category-picker'>
                  <CategoryTag name={detail.category} />
                  <Text className='picker-arrow'>▼</Text>
                </View>
              </Picker>
            ) : (
              <CategoryTag name={detail.category} />
            )}
          </View>
        </View>
      </View>

      <View className='action-bar'>
        <Button
          className='btn-edit'
          onClick={() => setEditing(!editing)}
        >
          {editing ? '取消编辑' : '编辑修改'}
        </Button>
        {editing && (
          <Button className='btn-save' onClick={handleSave} loading={saving}>
            保存
          </Button>
        )}
      </View>
    </View>
  );
}
