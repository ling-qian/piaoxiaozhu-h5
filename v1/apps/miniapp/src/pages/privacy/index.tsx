import { View, Text } from '@tarojs/components';
import { PAYMENT_ENABLED, PHONE_BIND_ENABLED } from '../../config/features';
import './index.scss';

interface Section {
  title: string;
  paragraphs: string[];
}

/**
 * 隐私政策文案。内容必须与本产品实际的数据处理行为一致：
 * 收集项对齐 users / invoice_files / invoice_records 三张表，
 * 第三方共享对齐微信登录支付、对象存储与大模型分类。
 * 修改数据处理逻辑时，这里要同步更新。
 *
 * 手机号与微信支付两段文案随 config/features.ts 的开关联动：能力关闭时
 * 不再声明对应的收集/共享行为，避免「隐私指引与实际收集不符」被审核判定异常。
 */
const PHONE_COLLECT_ITEM =
  '3. 手机号：仅在您主动点击「绑定手机号」并同意微信授权后收集，用于账号找回与客服联系。您不提供不影响正常使用。';

const SECTIONS: Section[] = [
  {
    title: '一、我们收集哪些信息',
    paragraphs: [
      '1. 微信登录标识（openid）：您使用微信登录时由微信提供，用于创建和识别您的账号。我们无法通过它获取您的微信号、真实姓名或身份证信息。',
      '2. 昵称与头像：仅在您主动进入「我的 - 编辑资料」并授权后收集，用于在小程序内展示。您不提供不影响正常使用。',
      ...(PHONE_BIND_ENABLED ? [PHONE_COLLECT_ITEM] : []),
      `${PHONE_BIND_ENABLED ? 4 : 3}. 票据图片与识别结果：您上传的发票、票据图片，以及从中识别出的商户名称、金额、税额、开票日期与分类结果。这是为您提供票据归档与报表功能所必需的信息。`,
      `${PHONE_BIND_ENABLED ? 5 : 4}. 您录入的业务数据：项目名称、行业、手工录入的收支记录。`,
    ],
  },
  {
    title: '二、我们如何使用这些信息',
    paragraphs: [
      '1. 提供核心功能：票据识别、自动分类、成本统计与报表生成。',
      '2. 账号管理与登录态维持。',
      '3. 响应您的客服咨询与问题排查。',
      '我们不会将上述信息用于广告推送，也不会出售给任何第三方。',
    ],
  },
  {
    title: '三、信息如何对外提供',
    paragraphs: [
      PAYMENT_ENABLED
        ? '1. 腾讯微信：登录时向微信换取 openid；购买套餐时通过微信支付完成收款。'
        : '1. 腾讯微信：登录时向微信换取 openid。',
      '2. 对象存储服务商：用于存放您上传的票据图片与头像文件。',
      '3. 大模型服务商：当票据的自动分类置信度不足时，我们会将票据中的商户名称与识别文本发送至大模型服务商，用于判断支出分类。该过程不包含您的手机号、昵称等身份信息。',
      '除上述为实现功能所必需的情形外，我们不会向任何第三方提供您的信息，法律法规另有规定的除外。',
    ],
  },
  {
    title: '四、信息如何保存',
    paragraphs: [
      '1. 您的数据保存在我们的服务器数据库与对象存储中。',
      '2. 数据传输过程使用 HTTPS 加密。',
      '3. 保存期限为您的账号存续期间。您注销账号后，我们将删除上述全部信息。',
    ],
  },
  {
    title: '五、您的权利',
    paragraphs: [
      PHONE_BIND_ENABLED
        ? '1. 查看与更正：进入「我的 - 编辑资料」可查看和修改昵称、头像，并完成手机号绑定。'
        : '1. 查看与更正：进入「我的 - 编辑资料」可查看和修改昵称、头像。',
      '2. 删除与注销：进入「我的 - 注销账号」可删除账号及全部数据。注销后数据不可恢复。',
      '3. 撤回授权：您可以在微信「设置 - 隐私 - 授权管理」中撤回对本小程序的授权。',
      '4. 联系我们：可通过小程序内「我的 - 在线客服」与我们联系，我们将在收到请求后 15 个工作日内答复。',
    ],
  },
  {
    title: '六、未成年人保护',
    paragraphs: [
      '本小程序面向经营者提供票据管理服务。若您为未成年人，请在监护人陪同下阅读本政策，并在取得监护人同意后使用本服务。',
    ],
  },
  {
    title: '七、政策更新',
    paragraphs: [
      '本政策可能因功能调整而更新。更新后我们会在小程序内提示，继续使用即视为您接受更新后的政策。',
    ],
  },
];

export default function Privacy() {
  return (
    <View className='privacy-page'>
      <View className='privacy-header'>
        <Text className='privacy-title'>隐私政策</Text>
        <Text className='privacy-updated'>最近更新：2026 年 10 月</Text>
      </View>

      <Text className='privacy-intro'>
        AI票小助（以下简称「本小程序」）尊重并保护您的个人信息。本政策说明我们收集哪些信息、如何使用与保存，以及您可以如何管理这些信息。请您在使用前仔细阅读。
      </Text>

      {SECTIONS.map((section) => (
        <View key={section.title} className='privacy-section'>
          <Text className='section-title'>{section.title}</Text>
          {section.paragraphs.map((p, idx) => (
            <Text key={idx} className='section-text'>
              {p}
            </Text>
          ))}
        </View>
      ))}

      <Text className='privacy-footer'>
        如您对本政策有任何疑问，可通过「我的 - 在线客服」联系我们。
      </Text>
    </View>
  );
}
