import { View, Text, Input, Textarea, Picker } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState } from 'react';
import { insightsApi, recordApi, type ParsedEntry } from '../../services/api';
import { requireLogin } from '../../utils/authGate';
import './index.scss';

const CATEGORIES = ['食材', '房租', '工资', '水电', '平台佣金', '广告', '办公', '其他'];

export default function QuickEntryPage() {
  const params = Taro.getCurrentInstance().router?.params || {};
  const projectId = params.projectId || '';

  const [text, setText] = useState('');
  const [draft, setDraft] = useState<ParsedEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const parse = async () => {
    if (!text.trim() || loading) return;
    if (!(await requireLogin())) return;
    setLoading(true);
    try {
      const res: any = await insightsApi.parseText(text.trim());
      setDraft(res);
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '没太听懂，换个说法', icon: 'none' });
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!draft || saving) return;
    if (!draft.amount || draft.amount <= 0) {
      Taro.showToast({ title: '请填写金额', icon: 'none' });
      return;
    }
    if (!projectId) {
      Taro.showToast({ title: '缺少项目，请从项目页进入', icon: 'none' });
      return;
    }
    setSaving(true);
    try {
      await recordApi.create({
        project_id: projectId,
        direction: draft.direction,
        amount: draft.amount,
        merchant_name: draft.merchant || '手工录入',
        invoice_date: draft.date || '',
        category_l1: draft.category_l1,
        raw_text: draft.note,
        reason: '对话式记账',
      });
      Taro.showToast({ title: '已记账', icon: 'success' });
      setTimeout(() => Taro.navigateBack(), 800);
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '保存失败', icon: 'none' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className='qe-page'>
      <View className='qe-hero'>
        <Text className='qe-title'>说一句就记上</Text>
        <Text className='qe-desc'>没有票也能记：现金采购、临时买料、收据丢了</Text>
      </View>

      <View className='qe-input-card'>
        <Textarea
          className='qe-textarea'
          value={text}
          placeholder='例如：昨天盒马买菜 128'
          maxlength={120}
          autoHeight
          onInput={(e) => setText(e.detail.value)}
        />
        <View className={`qe-parse-btn ${loading || !text.trim() ? 'qe-parse-btn--disabled' : ''}`} onClick={parse}>
          <Text className='qe-parse-text'>{loading ? '解析中…' : '解析'}</Text>
        </View>
      </View>

      {draft && (
        <View className='qe-draft'>
          <Text className='qe-draft-title'>
            {draft.ok ? '确认一下，可以直接改' : '还差金额，补上就能记'}
          </Text>

          <View className='qe-row'>
            <Text className='qe-label'>方向</Text>
            <View className='qe-seg'>
              {[
                { v: 'out', t: '支出' },
                { v: 'income', t: '收入' },
              ].map((o) => (
                <View
                  key={o.v}
                  className={`qe-seg-item ${draft.direction === o.v ? 'qe-seg-item--on' : ''}`}
                  onClick={() => setDraft({ ...draft, direction: o.v as any })}
                >
                  <Text className='qe-seg-text'>{o.t}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className='qe-row'>
            <Text className='qe-label'>金额</Text>
            <Input
              className='qe-field'
              type='digit'
              value={draft.amount ? String(draft.amount) : ''}
              placeholder='必填'
              onInput={(e) => setDraft({ ...draft, amount: Number(e.detail.value) || 0 })}
            />
          </View>

          <View className='qe-row'>
            <Text className='qe-label'>商户</Text>
            <Input
              className='qe-field'
              value={draft.merchant}
              placeholder='可不填'
              onInput={(e) => setDraft({ ...draft, merchant: e.detail.value })}
            />
          </View>

          <View className='qe-row'>
            <Text className='qe-label'>日期</Text>
            <Picker
              mode='date'
              value={draft.date || ''}
              onChange={(e) => setDraft({ ...draft, date: e.detail.value as string })}
            >
              <View className='qe-field qe-field--picker'>
                <Text className='qe-field-text'>{draft.date || '选择日期'}</Text>
              </View>
            </Picker>
          </View>

          <View className='qe-row'>
            <Text className='qe-label'>分类</Text>
            <Picker
              mode='selector'
              range={CATEGORIES}
              value={Math.max(0, CATEGORIES.indexOf(draft.category_l1))}
              onChange={(e) => setDraft({ ...draft, category_l1: CATEGORIES[Number(e.detail.value)] })}
              disabled={draft.direction === 'income'}
            >
              <View className='qe-field qe-field--picker'>
                <Text className='qe-field-text'>{draft.category_l1}</Text>
              </View>
            </Picker>
          </View>

          <View className={`qe-save ${saving ? 'qe-save--disabled' : ''}`} onClick={save}>
            <Text className='qe-save-text'>{saving ? '保存中…' : '确认记账'}</Text>
          </View>
        </View>
      )}
    </View>
  );
}
