import { View, Text } from '@tarojs/components';
import './index.scss';

interface QuotaCardProps {
  remaining: number;
  total: number;
  plan: string;
  onUpgrade?: () => void;
}

export default function QuotaCard({ remaining, total, plan, onUpgrade }: QuotaCardProps) {
  const percentage = total > 0 ? (remaining / total) * 100 : 0;
  const isLow = percentage <= 20;

  return (
    <View className='quota-card' onClick={onUpgrade}>
      <View className='quota-header'>
        <Text className='quota-plan'>{plan}</Text>
        <Text className='quota-upgrade'>升级 ›</Text>
      </View>
      <View className='quota-body'>
        <Text className='quota-remaining'>{remaining}</Text>
        <Text className='quota-total'> / {total === -1 ? '∞' : total} 次</Text>
      </View>
      <Text className='quota-label'>本月剩余识别次数</Text>
      <View className='quota-track'>
        <View
          className={`quota-fill ${isLow ? 'low' : ''}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </View>
      {isLow && (
        <Text className='quota-warning'>识别次数不足，请升级会员</Text>
      )}
    </View>
  );
}
