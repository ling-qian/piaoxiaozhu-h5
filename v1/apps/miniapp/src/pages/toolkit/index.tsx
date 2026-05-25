import { View, Text } from '@tarojs/components';
import { useState, useEffect } from 'react';
import { toolkitApi } from '../../services/api';
import './index.scss';

interface ContentItem {
  id: string;
  title: string;
  content: string;
  category: string;
}

const FALLBACK_CONTENTS: ContentItem[] = [
  {
    id: 'tax-1',
    title: '增值税税率',
    content: '一般纳税人：13%（货物销售、修理修配等）、9%（交通运输、建筑、不动产租赁等）、6%（现代服务、生活服务等）\n小规模纳税人：3%（征收率），阶段性减按1%征收',
    category: '税收政策速查',
  },
  {
    id: 'tax-2',
    title: '企业所得税税率',
    content: '法定税率：25%\n小型微利企业：实际税负5%（年应纳税所得额不超过300万元）\n高新技术企业：15%\n技术先进型服务企业：15%',
    category: '税收政策速查',
  },
  {
    id: 'tax-3',
    title: '小微企业优惠',
    content: '小型微利企业条件：年度应纳税所得额不超过300万元、从业人数不超过300人、资产总额不超过5000万元\n增值税：月销售额10万元以下免征增值税\n附加税：增值税小规模纳税人减半征收"六税两费"',
    category: '税收政策速查',
  },
  {
    id: 'invoice-1',
    title: '开票流程',
    content: '1. 登录增值税发票开票软件\n2. 选择发票类型（增值税专用发票/普通发票）\n3. 填写购买方信息（名称、税号、地址电话、开户行及账号）\n4. 填写商品或服务信息（名称、规格型号、数量、单价、税率）\n5. 核对金额和税额\n6. 点击开具并打印',
    category: '发票操作指南',
  },
  {
    id: 'invoice-2',
    title: '红字发票',
    content: '适用情形：销货退回、开票有误、应税服务中止等\n操作流程：\n1. 购买方已认证：由购买方填开《开具红字增值税专用发票信息表》\n2. 购买方未认证：由销售方填开信息表\n3. 主管税务机关审核通过后，销售方开具红字专用发票',
    category: '发票操作指南',
  },
  {
    id: 'invoice-3',
    title: '发票查验',
    content: '查验渠道：\n1. 全国增值税发票查验平台（https://inv-veri.chinatax.gov.cn）\n2. 当地税务局官方APP\n3. 12366纳税服务热线\n查验要素：发票代码、发票号码、开票日期、开具金额（不含税）\n注意事项：当日开具的发票最快可于次日查验',
    category: '发票操作指南',
  },
];

export default function Toolkit() {
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [activeCategory, setActiveCategory] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadContents();
  }, []);

  const loadContents = async () => {
    try {
      const data = await toolkitApi.getContents();
      const items = data.items || [];
      if (items.length > 0) {
        setContents(items);
        const categories = [...new Set(items.map((i: ContentItem) => i.category))];
        if (categories.length > 0) setActiveCategory(categories[0]);
      } else {
        useFallback();
      }
    } catch {
      useFallback();
    }
  };

  const useFallback = () => {
    setContents(FALLBACK_CONTENTS);
    setActiveCategory(FALLBACK_CONTENTS[0].category);
  };

  const categories = [...new Set(contents.map((i) => i.category))];
  const filteredContents = activeCategory
    ? contents.filter((i) => i.category === activeCategory)
    : contents;

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <View className='toolkit-page'>
      <View className='toolkit-header'>
        <Text className='header-title'>工具箱</Text>
        <Text className='header-desc'>实用财税知识速查</Text>
      </View>

      {categories.length > 1 && (
        <View className='category-tabs'>
          {categories.map((cat) => (
            <View
              key={cat}
              className={`category-tab ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              <Text className='tab-text'>{cat}</Text>
            </View>
          ))}
        </View>
      )}

      <View className='content-list'>
        {filteredContents.map((item) => {
          const isExpanded = expandedId === item.id;
          return (
            <View key={item.id} className='content-card' onClick={() => toggleExpand(item.id)}>
              <View className='content-header'>
                <Text className='content-title'>{item.title}</Text>
                <Text className={`content-arrow ${isExpanded ? 'expanded' : ''}`}>›</Text>
              </View>
              {isExpanded && (
                <View className='content-body'>
                  <Text className='content-text'>{item.content}</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
