import { View, Text, Input, ScrollView } from '@tarojs/components';
import { useState } from 'react';
import { insightsApi } from '../../services/api';
import './index.scss';

interface Turn {
  question: string;
  answer: string;
  interpretation?: string;
  timeRange?: string;
  failed?: boolean;
}

/** 引导问题：让用户第一次进来就知道能问什么，而不是对着空输入框发呆 */
const SUGGESTIONS = [
  '这个月总共花了多少钱',
  '哪家供应商最贵',
  '按月份看支出趋势',
  '食材一共花了多少',
];

export default function AskPage() {
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [freeLeft, setFreeLeft] = useState<number | null>(null);

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || loading) return;
    setLoading(true);
    setQuestion('');

    try {
      const res: any = await insightsApi.ask(text);
      if (typeof res.free_remaining === 'number') setFreeLeft(res.free_remaining);
      setTurns((prev) => [
        ...prev,
        {
          question: text,
          answer: res.answer || '',
          interpretation: res.interpretation,
          timeRange: res.time_range,
        },
      ]);
    } catch (e: any) {
      // 后端对「非记账问题」会返回 400 中文提示，直接展示给用户
      setTurns((prev) => [
        ...prev,
        { question: text, answer: e?.message || '这次没查出来，换个说法试试', failed: true },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className='ask-page'>
      <View className='ask-hero'>
        <Text className='ask-hero-title'>问一句</Text>
        <Text className='ask-hero-desc'>用大白话查你的账，不用翻报表</Text>
        {freeLeft !== null && (
          <Text className={`ask-free-tip ${freeLeft === 0 ? 'ask-free-tip--out' : ''}`}>
            {freeLeft > 0
              ? `今日还剩 ${freeLeft} 次免费提问`
              : '今日免费次数已用完，之后每次 1 积分'}
          </Text>
        )}
      </View>

      {turns.length === 0 ? (
        <View className='ask-empty'>
          <Text className='ask-empty-tip'>试试这样问：</Text>
          {SUGGESTIONS.map((s) => (
            <View key={s} className='ask-chip' onClick={() => ask(s)}>
              <Text className='ask-chip-text'>{s}</Text>
            </View>
          ))}
        </View>
      ) : (
        <ScrollView className='ask-scroll' scrollY scrollIntoView='ask-bottom'>
          {turns.map((t, idx) => (
            <View key={idx} className='ask-turn'>
              <View className='ask-q'>
                <Text className='ask-q-text'>{t.question}</Text>
              </View>
              <View className={`ask-a ${t.failed ? 'ask-a--failed' : ''}`}>
                <Text className='ask-a-text'>{t.answer}</Text>
                {!t.failed && (t.interpretation || t.timeRange) && (
                  <Text className='ask-a-meta'>
                    {t.timeRange && t.timeRange !== '全部时间' ? `${t.timeRange} · ` : ''}
                    {t.interpretation}
                  </Text>
                )}
              </View>
            </View>
          ))}
          <View id='ask-bottom' className='ask-bottom-space' />
        </ScrollView>
      )}

      <View className='ask-input-bar'>
        <Input
          className='ask-input'
          value={question}
          placeholder='例如：上个月食材花了多少'
          confirmType='send'
          maxlength={200}
          onInput={(e) => setQuestion(e.detail.value)}
          onConfirm={() => ask(question)}
        />
        <View className={`ask-send ${loading || !question.trim() ? 'ask-send--disabled' : ''}`} onClick={() => ask(question)}>
          <Text className='ask-send-text'>{loading ? '查询中' : '发送'}</Text>
        </View>
      </View>
    </View>
  );
}
