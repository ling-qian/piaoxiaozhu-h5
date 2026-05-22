import { View, Text } from '@tarojs/components';
import './index.scss';

interface CategoryTagProps {
  name: string;
  color?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  '餐饮': '#FF6B35',
  '交通': '#1890FF',
  '住宿': '#722ED1',
  '办公用品': '#52C41A',
  '通讯': '#13C2C2',
  '差旅': '#EB2F96',
  '会议': '#FAAD14',
  '培训': '#2F54EB',
  '广告': '#FA541C',
  '维修': '#A0D911',
  '水电费': '#597EF7',
  '其他': '#8C8C8C',
};

export default function CategoryTag({ name, color }: CategoryTagProps) {
  const tagColor = color || CATEGORY_COLORS[name] || '#8C8C8C';

  return (
    <View className='category-tag' style={{ backgroundColor: `${tagColor}15`, borderColor: `${tagColor}40` }}>
      <View className='tag-dot' style={{ backgroundColor: tagColor }} />
      <Text className='tag-text' style={{ color: tagColor }}>{name}</Text>
    </View>
  );
}
