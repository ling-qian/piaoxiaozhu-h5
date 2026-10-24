import { View, Text, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useEffect, useState } from 'react';
import { pointsApi } from '../../services/api';
import './index.scss';
import { requireLogin } from '../../utils/authGate';

interface CalendarData {
  month: string;
  today: string;
  checked_dates: string[];
  today_checked_in: boolean;
  month_count: number;
  streak: number;
  balance: number;
  reward: number;
}

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

/** 生成某月的日历格子（前后补 null），7 列 */
function buildCells(month: string): (string | null)[] {
  const [y, m] = month.split('-').map(Number);
  const firstWeekday = new Date(y, m - 1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push(`${month}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

export default function Checkin() {
  const [data, setData] = useState<CalendarData | null>(null);
  const [month, setMonth] = useState('');
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);

  const load = async (targetMonth?: string) => {
    setLoading(true);
    try {
      const res = await pointsApi.getCheckinCalendar(targetMonth);
      setData(res);
      setMonth(res.month);
    } catch {
      Taro.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCheckin = async () => {
    if (checkingIn || data?.today_checked_in) return;
    if (!(await requireLogin())) return;
    setCheckingIn(true);
    try {
      const res = await pointsApi.checkin();
      await load(month);
      Taro.showToast({ title: res.message || '签到成功', icon: 'success' });
    } catch (e: any) {
      Taro.showToast({ title: e?.message || '签到失败', icon: 'none' });
      await load(month);
    } finally {
      setCheckingIn(false);
    }
  };

  const cells = month ? buildCells(month) : [];
  const checkedSet = new Set(data?.checked_dates || []);
  const isFuture = (day: string) => day > (data?.today || '');

  return (
    <ScrollView scrollY className='checkin-page'>
      <View className='hero'>
        <Text className='hero-label'>当前积分</Text>
        <Text className='hero-value'>{data?.balance ?? '—'}</Text>
        <View className='hero-stats'>
          <View className='hero-stat'>
            <Text className='stat-num'>{data?.streak ?? 0}</Text>
            <Text className='stat-label'>连续签到</Text>
          </View>
          <View className='hero-stat'>
            <Text className='stat-num'>{data?.month_count ?? 0}</Text>
            <Text className='stat-label'>本月已签</Text>
          </View>
          <View className='hero-stat'>
            <Text className='stat-num'>+{data?.reward ?? 2}</Text>
            <Text className='stat-label'>每日奖励</Text>
          </View>
        </View>
      </View>

      <View className='cal-card'>
        {loading && <Text className='cal-loading'>加载中…</Text>}
        <View className='cal-head'>
          <Text className='cal-arrow' onClick={() => load(shiftMonth(month, -1))}>‹</Text>
          <Text className='cal-month'>{month}</Text>
          <Text className='cal-arrow' onClick={() => load(shiftMonth(month, 1))}>›</Text>
        </View>

        <View className='cal-week'>
          {WEEK_LABELS.map((w) => (
            <Text className='week-cell' key={w}>{w}</Text>
          ))}
        </View>

        <View className='cal-grid'>
          {cells.map((day, idx) => {
            if (!day) return <View className='cal-cell cal-cell--empty' key={`empty-${idx}`} />;
            const checked = checkedSet.has(day);
            const today = day === data?.today;
            const future = isFuture(day);
            return (
              <View
                className={`cal-cell ${checked ? 'cal-cell--checked' : ''} ${
                  today ? 'cal-cell--today' : ''
                } ${future ? 'cal-cell--future' : ''}`}
                key={day}
              >
                <Text className='day-num'>{Number(day.slice(-2))}</Text>
                {checked && <Text className='day-mark'>✓</Text>}
              </View>
            );
          })}
        </View>

        <View className='cal-legend'>
          <View className='legend-item'>
            <View className='legend-dot legend-dot--checked' />
            <Text className='legend-text'>已签到</Text>
          </View>
          <View className='legend-item'>
            <View className='legend-dot legend-dot--today' />
            <Text className='legend-text'>今天</Text>
          </View>
          <View className='legend-item'>
            <View className='legend-dot legend-dot--miss' />
            <Text className='legend-text'>未签到</Text>
          </View>
        </View>
      </View>

      <View className='action-wrap'>
        <View
          className={`checkin-btn ${data?.today_checked_in ? 'checkin-btn--done' : ''}`}
          onClick={handleCheckin}
        >
          <Text className='checkin-btn-text'>
            {data?.today_checked_in
              ? '今日已签到'
              : checkingIn
                ? '签到中…'
                : `签到 +${data?.reward ?? 2} 积分`}
          </Text>
        </View>
        <Text className='rule-text'>
          每天可签到一次，获得 {data?.reward ?? 2} 积分；中断后连续天数重新计算。
          积分可用于票据识别与 AI 经营分析。
        </Text>
      </View>

      <View className='bottom-gap' />
    </ScrollView>
  );
}
