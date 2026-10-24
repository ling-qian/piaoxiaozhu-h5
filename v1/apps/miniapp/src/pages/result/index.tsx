import { View, Text, Button, Input, Picker } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState, useMemo, useRef } from 'react';
import { recordApi, fileApi } from '../../services/api';
import { useStore } from '../../store';
import CategoryTag from '../../components/CategoryTag';
import './index.scss';

const CATEGORIES = [
  { code: 'food_material', name: '食材', l1: '食材', l2: '食材' },
  { code: 'rent', name: '房租', l1: '房租', l2: '房租' },
  { code: 'salary', name: '工资', l1: '工资', l2: '工资' },
  { code: 'utilities', name: '水电', l1: '水电', l2: '水电' },
  { code: 'platform_fee', name: '平台佣金', l1: '平台佣金', l2: '平台佣金' },
  { code: 'advertising', name: '广告', l1: '广告', l2: '广告' },
  { code: 'office', name: '办公', l1: '办公', l2: '办公' },
  { code: 'other', name: '其他', l1: '其他', l2: '其他' },
];

interface VerifyCheckItem {
  key: string;
  label: string;
  level: string;
  detail: string;
}

interface VerifyDetail {
  checks?: VerifyCheckItem[];
  official?: {
    elements?: {
      invoice_code?: string | null;
      invoice_no?: string | null;
      invoice_date?: string | null;
      amount_without_tax?: string | null;
    };
    complete?: boolean;
    url?: string;
    missing?: string[];
  };
}

interface DuplicateDetail {
  id: string;
  project_id: string;
  merchant_name: string | null;
  amount: number | null;
  invoice_date: string | null;
  invoice_no: string | null;
  created_at: string | null;
}

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
  file_id?: string;
  /** 销方纳税人识别号，票面自检要用 */
  tax_no?: string | null;
  invoice_code?: string | null;
  invoice_no?: string | null;
  /** 命中的重复记录 id；只标记不自动删 */
  duplicate_of?: string | null;
  is_duplicate?: boolean;
  /** strong（有发票号码，可靠）/ weak（仅销方+日期+金额，需人工确认） */
  fingerprint_strength?: string | null;
  /** pass / attention / suspect / insufficient */
  verify_status?: string | null;
  verify_detail?: VerifyDetail | null;
  verify_checked_at?: string | null;
  /** 仅详情接口会带出，用于展示「和哪条重复」 */
  duplicate_detail?: DuplicateDetail | null;
  /** 识别解释：分类理由，或「看起来不像发票」这类提示 */
  reason?: string | null;
}

/**
 * 票面自检的四态文案。措辞必须守住边界：这是**本地结构校验**，
 * 不是税局真伪查验结果，任何一处都不能写成「已验真」。
 */
const VERDICT_TEXT: Record<string, string> = {
  pass: '票面自检通过',
  attention: '票面有需留意项',
  suspect: '票面存在疑点',
  insufficient: '信息不足，无法自检',
};

const VERDICT_COLOR: Record<string, string> = {
  pass: '#52C41A',
  attention: '#FAAD14',
  suspect: '#FF4D4F',
  insufficient: '#999999',
};

const VERDICT_NOTE: Record<string, string> = {
  pass: '金额、税额、号码位数等结构未发现矛盾；真伪请到官方查验平台确认',
  attention: '以下项目建议人工核对后保存',
  suspect: '以下项目不符合常见票面规则，请核对是否录入有误',
  insufficient: '缺少发票号码、开票日期或金额，无法做结构自检',
};

const CHECK_LEVEL_ICON: Record<string, string> = {
  ok: '✓',
  warn: '!',
  fail: '✕',
};

const CHECK_LEVEL_COLOR: Record<string, string> = {
  ok: '#52C41A',
  warn: '#FAAD14',
  fail: '#FF4D4F',
};

/**
 * 国家税务总局全国增值税发票查验平台入口。小程序内不能直接打开外部网页
 * （web-view 需配置业务域名），因此只做展示 + 复制，由用户自行前往查验。
 */
const OFFICIAL_VERIFY_URL = 'https://inv-veri.chinatax.gov.cn';

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

function getConfidenceHint(confidence: number): string {
  if (confidence >= 0.9) return '识别结果较准确，可直接保存';
  if (confidence >= 0.7) return '建议核对后再保存';
  return '识别结果可能不准确，请仔细核对';
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
  const urlProjectId = params.projectId || '';

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
  const [loadingRecord, setLoadingRecord] = useState(false);
  const loadedByIdRef = useRef(false);

  Taro.useDidShow(() => {
    if (isManual) {
      fetchProjects().then(() => {
        const store = useStore.getState();
        setProjectList(store.projects);
        if (urlProjectId) {
          const idx = store.projects.findIndex((p) => p.id === urlProjectId);
          if (idx >= 0) setSelectedProjectIdx(idx);
        } else if (store.currentProject) {
          const idx = store.projects.findIndex((p) => p.id === store.currentProject!.id);
          if (idx >= 0) setSelectedProjectIdx(idx);
        }
      });
    } else if (params.id && !loadedByIdRef.current) {
      loadedByIdRef.current = true;
      // 即使页面参数里带了记录快照也再拉一次详情：上传返回的快照里没有
      // 查重命中（duplicate_of/duplicate_detail）与票面自检（verify_detail），
      // 不拉详情这两块永远空着。有快照时先渲染，详情到了再覆盖。
      setLoadingRecord(!initialRecord);
      recordApi.getDetail(params.id).then((res: any) => {
        const r = res as RecordData;
        setRecord(r);
        setCategoryIdx(findCategoryIndex(r.category_code || 'other'));
      }).catch(() => {
        Taro.showToast({ title: '加载记录失败', icon: 'none' });
      }).finally(() => {
        setLoadingRecord(false);
      });
    }
  });

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reRecognizing, setReRecognizing] = useState(false);
  const [reVerifying, setReVerifying] = useState(false);

  const { projects, fetchProjects } = useStore();
  const [projectList, setProjectList] = useState<ProjectItem[]>(projects || []);
  const [selectedProjectIdx, setSelectedProjectIdx] = useState(0);
  const [form, setForm] = useState({
    merchant_name: '',
    amount: '',
    tax_amount: '',
    invoice_date: '',
    invoice_code: '',
    invoice_no: '',
    tax_no: '',
  });
  const [manualCategoryIdx, setManualCategoryIdx] = useState(0);
  const [manualDirection, setManualDirection] = useState<'out' | 'income'>('out');
  const [submitting, setSubmitting] = useState(false);

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
        tax_no: record.tax_no || undefined,
        amount: record.amount,
        tax_amount: record.tax_amount,
        invoice_date: record.invoice_date,
        invoice_code: record.invoice_code || undefined,
        invoice_no: record.invoice_no || undefined,
        category_code: record.category_code,
        category_l1: record.category_l1,
        category_l2: record.category_l2,
      });
      Taro.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => Taro.navigateBack(), 800);
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

  const handleReRecognize = async () => {
    if (!record?.file_id) {
      Taro.showToast({ title: '无原始文件，无法重新识别', icon: 'none' });
      return;
    }
    setReRecognizing(true);
    try {
      await fileApi.triggerOcr(record.file_id);
      Taro.showToast({ title: '已重新提交识别', icon: 'success' });
      let attempts = 0;
      const poll = async () => {
        if (attempts > 30) {
          Taro.showToast({ title: '识别超时', icon: 'none' });
          setReRecognizing(false);
          return;
        }
        attempts++;
        try {
          const res = await fileApi.getOcrStatus(record.file_id!);
          if (res.ocr_status === 'done') {
            const records = res.records || [];
            if (records.length > 0) {
              const newRecord = records[0];
              setRecord(newRecord);
              setCategoryIdx(findCategoryIndex(newRecord.category_code || 'other'));
              Taro.showToast({ title: '重新识别完成', icon: 'success' });
            } else {
              Taro.showToast({ title: '未提取到信息', icon: 'none' });
            }
            setReRecognizing(false);
          } else if (res.ocr_status === 'failed') {
            Taro.showToast({ title: '识别失败', icon: 'none' });
            setReRecognizing(false);
          } else {
            setTimeout(poll, 2000);
          }
        } catch {
          Taro.showToast({ title: '查询识别状态失败', icon: 'none' });
          setReRecognizing(false);
        }
      };
      setTimeout(poll, 2000);
    } catch {
      Taro.showToast({ title: '提交失败', icon: 'none' });
      setReRecognizing(false);
    }
  };

  const handleManualCategoryChange = (e: any) => {
    setManualCategoryIdx(Number(e.detail.value));
  };

  const handleProjectChange = (e: any) => {
    setSelectedProjectIdx(Number(e.detail.value));
  };

  /**
   * 重跑票面自检。注意后端是按**库里已保存的字段**算的，
   * 页面上改了还没保存的号码/金额不会计入。
   */
  const handleReVerify = async () => {
    if (!record) return;
    setReVerifying(true);
    try {
      const res = await recordApi.verify(record.id);
      setRecord((prev) =>
        prev
          ? {
              ...prev,
              verify_status: res.status,
              verify_detail: { checks: res.checks, official: res.official },
              verify_checked_at: res.checked_at,
            }
          : prev,
      );
      Taro.showToast({ title: '自检完成', icon: 'success' });
    } catch {
      Taro.showToast({ title: '自检失败，请重试', icon: 'none' });
    } finally {
      setReVerifying(false);
    }
  };

  const handleCopyVerifyUrl = () => {
    const url = record?.verify_detail?.official?.url || OFFICIAL_VERIFY_URL;
    Taro.setClipboardData({ data: url });
  };

  const handleViewOriginal = (originalId: string) => {
    Taro.navigateTo({ url: `/pages/result/index?id=${originalId}` });
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
    if (!form.amount || parseAmountInput(form.amount) <= 0) {
      Taro.showToast({ title: '请输入金额', icon: 'none' });
      return;
    }

    setSubmitting(true);
    try {
      const cat = CATEGORIES[manualCategoryIdx];
      await recordApi.create({
        project_id: projectList[selectedProjectIdx].id,
        direction: manualDirection,
        merchant_name: form.merchant_name.trim(),
        amount: parseAmountInput(form.amount),
        tax_amount: parseAmountInput(form.tax_amount),
        invoice_date: form.invoice_date,
        // 号码/税号留空时不传，交给后端按「无身份字段不查重」处理
        invoice_code: form.invoice_code.trim() || undefined,
        invoice_no: form.invoice_no.trim() || undefined,
        tax_no: form.tax_no.trim() || undefined,
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
        <View className='page-header'>
          <Text className='page-header-title'>手动录入</Text>
        </View>

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
            <Text className='field-label'>类型</Text>
            <View className='direction-switch'>
              <View
                className={`direction-option ${manualDirection === 'out' ? 'active' : ''}`}
                onClick={() => setManualDirection('out')}
              >
                <Text className='direction-option-text'>支出</Text>
              </View>
              <View
                className={`direction-option ${manualDirection === 'income' ? 'active' : ''}`}
                onClick={() => setManualDirection('income')}
              >
                <Text className='direction-option-text'>收入</Text>
              </View>
            </View>
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

          {/* 录入号码/税号后，后端才能做查重与票面自检；不填则不查重。 */}
          <View className='field-item'>
            <Text className='field-label'>发票号码</Text>
            <Input
              className='field-input'
              value={form.invoice_no}
              onInput={(e) => handleFormInput('invoice_no', e.detail.value)}
              placeholder='数电票 20 位，可不填'
            />
          </View>

          <View className='field-item'>
            <Text className='field-label'>发票代码</Text>
            <Input
              className='field-input'
              value={form.invoice_code}
              onInput={(e) => handleFormInput('invoice_code', e.detail.value)}
              placeholder='数电票无此项，可不填'
            />
          </View>

          <View className='field-item'>
            <Text className='field-label'>销方税号</Text>
            <Input
              className='field-input'
              value={form.tax_no}
              onInput={(e) => handleFormInput('tax_no', e.detail.value)}
              placeholder='销售方纳税人识别号'
            />
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
        <Text className='loading-text'>{loadingRecord ? '加载中...' : '未找到记录'}</Text>
      </View>
    );
  }

  const confidencePct = (record.confidence * 100).toFixed(0);
  const confColor = getConfidenceColor(record.confidence);

  const verdict = record.verify_status || '';
  const verdictText = VERDICT_TEXT[verdict] || '';
  const verifyChecks = record.verify_detail?.checks || [];
  const official = record.verify_detail?.official;
  const duplicateDetail = record.duplicate_detail;
  // 弱指纹只是「疑似」：销方+日期+金额相同可能本来就存在同日同店同额的多张票
  const duplicateIsWeak = record.fingerprint_strength === 'weak';

  return (
    <View className='result-page'>
      <View className='page-header'>
        <Text className='page-header-title'>识别结果</Text>
      </View>

      {record.reason && record.reason.indexOf('不像发票') >= 0 && (
        <View className='not-invoice-banner'>
          <Text className='not-invoice-icon'>⚠️</Text>
          <Text className='not-invoice-text'>{record.reason}</Text>
        </View>
      )}

      <View className='confidence-bar'>
        <View className='confidence-info'>
          <Text className='confidence-label'>识别置信度</Text>
          <Text className='confidence-value' style={{ color: confColor }}>
            {getConfidenceText(record.confidence)}（{confidencePct}%）
          </Text>
        </View>
        <View className='confidence-track'>
          <View
            className='confidence-fill'
            style={{
              width: `${confidencePct}%`,
              backgroundColor: confColor,
            }}
          />
        </View>
        <Text className='confidence-hint' style={{ color: confColor }}>
          {getConfidenceHint(record.confidence)}
        </Text>
      </View>

      {record.is_duplicate && (
        <View className='dup-card'>
          <View className='dup-header'>
            <Text className={`dup-badge ${duplicateIsWeak ? 'dup-badge--weak' : 'dup-badge--strong'}`}>
              {duplicateIsWeak ? '疑似重复' : '重复票据'}
            </Text>
            <Text className='dup-title'>
              {duplicateIsWeak ? '疑似与已有记录重复' : '与已有记录重复'}
            </Text>
          </View>
          <Text className='dup-desc'>
            {duplicateIsWeak
              ? '销方税号、开票日期与价税合计都相同。同日同店的同额票据本就可能存在，请人工确认为同一张票。'
              : '发票号码相同，基本可断定是同一张票。'}
          </Text>
          {duplicateDetail && (
            <View className='dup-detail'>
              <Text className='dup-detail-text'>
                {`原件：${duplicateDetail.invoice_date || '日期未知'} · ￥${formatAmount(
                  duplicateDetail.amount ?? 0,
                )}${duplicateDetail.merchant_name ? ` · ${duplicateDetail.merchant_name}` : ''}`}
              </Text>
              <View
                className='dup-link'
                onClick={() => handleViewOriginal(duplicateDetail.id)}
              >
                <Text className='dup-link-text'>查看原件</Text>
              </View>
            </View>
          )}
          <Text className='dup-hint'>系统只做标记，不会自动删除，请确认真实性后自行处理。</Text>
        </View>
      )}

      <View className='result-card'>
        <View className='card-header'>
          <Text className='card-title'>票据信息</Text>
          {record.file_id && (
            <View className='re-recognize-btn' onClick={reRecognizing ? undefined : handleReRecognize}>
              <Text className={`re-recognize-text ${reRecognizing ? 'disabled' : ''}`}>
                {reRecognizing ? '识别中...' : '重新识别'}
              </Text>
            </View>
          )}
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

        {/* 号码可改：OCR 读错时改这里，保存后后端会重算查重指纹与票面自检 */}
        <View className='field-item'>
          <Text className='field-label'>发票号码</Text>
          <Input
            className='field-input'
            value={record.invoice_no || ''}
            onInput={(e) => updateField('invoice_no', e.detail.value)}
            placeholder='未识别到'
          />
        </View>

        <View className='field-item'>
          <Text className='field-label'>发票代码</Text>
          <Input
            className='field-input'
            value={record.invoice_code || ''}
            onInput={(e) => updateField('invoice_code', e.detail.value)}
            placeholder='未识别到'
          />
        </View>

        <View className='field-item'>
          <Text className='field-label'>销方税号</Text>
          <Input
            className='field-input'
            value={record.tax_no || ''}
            onInput={(e) => updateField('tax_no', e.detail.value)}
            placeholder='未识别到'
          />
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
              <CategoryTag name={CATEGORIES[categoryIdx].name} code={CATEGORIES[categoryIdx].code} />
              <Text className='picker-arrow'>▸</Text>
            </View>
          </Picker>
        </View>
      </View>

      {verdictText && (
        <View className='verify-card'>
          <View className='verify-header'>
            <Text className='card-title'>票面自检</Text>
            <View className='re-recognize-btn' onClick={reVerifying ? undefined : handleReVerify}>
              <Text className={`re-recognize-text ${reVerifying ? 'disabled' : ''}`}>
                {reVerifying ? '自检中...' : '重新自检'}
              </Text>
            </View>
          </View>

          <Text className='verify-verdict' style={{ color: VERDICT_COLOR[verdict] || '#999999' }}>
            {verdictText}
          </Text>
          <Text className='verify-note'>{VERDICT_NOTE[verdict] || ''}</Text>

          {verifyChecks.map((c) => (
            <View className='verify-item' key={c.key}>
              <Text
                className='verify-item-icon'
                style={{ color: CHECK_LEVEL_COLOR[c.level] || '#999999' }}
              >
                {CHECK_LEVEL_ICON[c.level] || '·'}
              </Text>
              <View className='verify-item-body'>
                <Text className='verify-item-label'>{c.label}</Text>
                <Text className='verify-item-detail'>{c.detail}</Text>
              </View>
            </View>
          ))}

          {official?.elements && (
            <View className='verify-official'>
              <Text className='verify-official-title'>官方查验要素</Text>
              <Text className='verify-official-line'>
                发票代码：{official.elements.invoice_code || '（数电票无此项）'}
              </Text>
              <Text className='verify-official-line'>
                发票号码：{official.elements.invoice_no || '—'}
              </Text>
              <Text className='verify-official-line'>
                开票日期：{official.elements.invoice_date || '—'}
              </Text>
              <Text className='verify-official-line'>
                不含税金额：{official.elements.amount_without_tax || '—'}
              </Text>
              <Text className='verify-official-tip'>
                {official.complete
                  ? '可带以上要素到国家税务总局查验平台核对真伪'
                  : '要素不全，补全号码、日期与金额后再去查验'}
              </Text>
              <View className='verify-copy-btn' onClick={handleCopyVerifyUrl}>
                <Text className='verify-copy-text'>复制查验平台网址</Text>
              </View>
            </View>
          )}

          <Text className='verify-disclaimer'>
            自检在本机完成，只校验票面结构是否自相矛盾，<Text className='verify-disclaimer-strong'>不是</Text>
            税局真伪查验结果。
          </Text>
        </View>
      )}

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
