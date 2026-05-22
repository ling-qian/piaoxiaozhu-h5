import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useStore } from '../../store';
import './index.scss';

interface ToolItem {
  icon: string;
  title: string;
  desc: string;
  url: string;
}

const TOOLS: ToolItem[] = [
  {
    icon: '📷',
    title: '拍照识别',
    desc: '拍照上传票据，AI智能识别',
    url: '/pages/upload/index',
  },
  {
    icon: '📋',
    title: '批量导入',
    desc: '从相册批量选择票据',
    url: '/pages/upload/index',
  },
  {
    icon: '📁',
    title: '项目管理',
    desc: '按项目归集票据和成本',
    url: '/pages/project/index',
  },
  {
    icon: '📊',
    title: '报表分析',
    desc: '查看项目利润和分类统计',
    url: '/pages/report/index',
  },
  {
    icon: '🏷️',
    title: '分类管理',
    desc: '自定义票据分类标签',
    url: '',
  },
  {
    icon: '📤',
    title: '数据导出',
    desc: '导出Excel或PDF报表',
    url: '',
  },
];

export default function Toolkit() {
  const { projects } = useStore();

  const handleToolClick = (tool: ToolItem) => {
    if (!tool.url) {
      Taro.showToast({ title: '功能开发中，敬请期待', icon: 'none' });
      return;
    }
    if (tool.url.includes('project') && projects.length > 0) {
      Taro.navigateTo({ url: `${tool.url}?id=${projects[0].id}` });
    } else {
      Taro.navigateTo({ url: tool.url });
    }
  };

  return (
    <View className='toolkit-page'>
      <View className='toolkit-header'>
        <Text className='header-title'>工具箱</Text>
        <Text className='header-desc'>高效管理您的票据和项目</Text>
      </View>

      <View className='tool-grid'>
        {TOOLS.map((tool, idx) => (
          <View
            key={idx}
            className='tool-card'
            onClick={() => handleToolClick(tool)}
          >
            <Text className='tool-icon'>{tool.icon}</Text>
            <Text className='tool-title'>{tool.title}</Text>
            <Text className='tool-desc'>{tool.desc}</Text>
          </View>
        ))}
      </View>

      <View className='project-section'>
        <View className='section-header'>
          <Text className='section-title'>我的项目</Text>
        </View>
        {projects.length > 0 ? (
          <View className='project-list'>
            {projects.map((project) => (
              <View
                key={project.id}
                className='project-card'
                onClick={() => Taro.navigateTo({ url: `/pages/project/index?id=${project.id}` })}
              >
                <View className='project-main'>
                  <Text className='project-name'>{project.name}</Text>
                  <Text className='project-meta'>
                    {project.recordCount} 条记录 · 成本 ¥{project.totalCost.toFixed(2)}
                  </Text>
                </View>
                <View className='project-stats'>
                  <Text className='stat-income'>收入 ¥{project.totalIncome.toFixed(2)}</Text>
                  <Text className='stat-arrow'>›</Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View className='empty-state'>
            <Text className='empty-icon'>📂</Text>
            <Text className='empty-text'>暂无项目</Text>
            <Text className='empty-hint'>上传票据后可自动创建项目</Text>
          </View>
        )}
      </View>
    </View>
  );
}
