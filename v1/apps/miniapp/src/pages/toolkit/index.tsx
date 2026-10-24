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

type PageStatus = 'loading' | 'ready' | 'error';

export default function Toolkit() {
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [activeCategory, setActiveCategory] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [status, setStatus] = useState<PageStatus>('loading');

  useEffect(() => {
    loadContents();
  }, []);

  // 内容只在后端维护一份，这里不再内嵌副本：加载失败时给出重试入口，
  // 避免内嵌的旧副本与后端漂移后被用户当成最新内容。
  const loadContents = async () => {
    setStatus('loading');
    try {
      const data = await toolkitApi.getContents();
      const items = data.items || [];
      if (items.length === 0) {
        setStatus('error');
        return;
      }
      setContents(items);
      setActiveCategory([...new Set(items.map((i) => i.category))][0]);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
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
        <Text className='header-desc'>实用票据知识速查</Text>
      </View>

      {status === 'loading' && (
        <View className='toolkit-status'>
          <Text className='status-text'>加载中…</Text>
        </View>
      )}

      {status === 'error' && (
        <View className='toolkit-status'>
          <Text className='status-text'>内容加载失败，请检查网络后重试</Text>
          <View className='status-retry' onClick={loadContents}>
            <Text className='retry-text'>重新加载</Text>
          </View>
        </View>
      )}

      {status === 'ready' && (
        <>
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
        </>
      )}
    </View>
  );
}
