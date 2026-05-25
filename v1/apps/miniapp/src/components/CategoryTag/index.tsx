import { View, Text } from '@tarojs/components';
import './index.scss';

interface CategoryTagProps {
  name: string;
  code?: string;
  color?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  '食材': '#FF6B35',
  '房租': '#722ED1',
  '工资': '#1890FF',
  '水电': '#597EF7',
  '平台佣金': '#FA541C',
  '广告': '#EB2F96',
  '办公': '#52C41A',
  '其他': '#8C8C8C',
  'food_material': '#FF6B35',
  'rent': '#722ED1',
  'salary': '#1890FF',
  'utilities': '#597EF7',
  'platform_fee': '#FA541C',
  'advertising': '#EB2F96',
  'office': '#52C41A',
  'other': '#8C8C8C',
  '中式正餐': '#FF6B35',
  '火锅烧烤': '#E8453C',
  '快餐简餐': '#F5A623',
  '烘焙甜品': '#D4813B',
  '饮品小食': '#7B68EE',
  '团餐食堂': '#52C41A',
  '交通': '#1890FF',
  '住宿': '#722ED1',
  '通讯': '#13C2C2',
  '差旅': '#EB2F96',
  '会议': '#FAAD14',
  '培训': '#2F54EB',
  '维修': '#A0D911',
};

export default function CategoryTag({ name, code, color }: CategoryTagProps) {
  const tagColor = color || CATEGORY_COLORS[name] || CATEGORY_COLORS[code || ''] || '#8C8C8C';

  return (
    <View className='category-tag' style={{ backgroundColor: `${tagColor}15`, borderColor: `${tagColor}40` }}>
      <View className='tag-dot' style={{ backgroundColor: tagColor }} />
      <Text className='tag-text' style={{ color: tagColor }}>{name}</Text>
    </View>
  );
}
