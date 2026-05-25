import { View, Text } from '@tarojs/components';
import './index.scss';

interface QuotaCardProps {
  planName: string;
  quotaUsed: number;
  quotaTotal: number;
  quotaRemaining: number;
  onUpgrade?: () => void;
}

export default function QuotaCard({ planName, quotaUsed, quotaTotal, quotaRemaining, onUpgrade }: QuotaCardProps) {
  const percentage = quotaTotal > 0 ? (quotaRemaining / quotaTotal) * 100 : 0;
  const isLow = percentage <= 20 && quotaTotal > 0;
  const isUnlimited = quotaTotal === -1;

  return (
    <View className='quota-card' onClick={onUpgrade}>
      <View className='quota-header'>
        <Text className='quota-plan'>{planName}</Text>
        <Text className='quota-upgrade'>升级 ›</Text>
      </View>
      <View className='quota-body'>
        <Text className='quota-remaining'>{quotaRemaining}</Text>
        <Text className='quota-total'> / {isUnlimited ? '∞' : quotaTotal} 次</Text>
      </View>
      <Text className='quota-label'>本月剩余识别次数（已用 {quotaUsed} 次）</Text>
      {!isUnlimited && (
        <View className='quota-track'>
          <View
            className={`quota-fill ${isLow ? 'low' : ''}`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </View>
      )}
      {isLow && (
        <Text className='quota-warning'>识别次数不足，请升级会员</Text>
      )}
    </View>
  );
}
