/**
 * 为新注册用户创建一条演示案件（硬编码数据，不消耗 API）
 */
export async function createDemoCase(db, userId) {
  const groups = ['侵权视频证据', '被告身份证据', '传播范围证据', '平台举报记录', '损害后果证明']

  const guide = [
    {
      group: '侵权视频证据',
      desc: '抖音视频截图，含发布时间与播放量',
      guide: '打开抖音找到对方账号，对每条侵权视频截「长截图」，确保画面包含账号名、发布时间、点赞评论数；若视频已删除，可联系平台申请存档。',
    },
    {
      group: '被告身份证据',
      desc: '对方账号主页及实名信息截图',
      guide: '截图账号主页，保留头像、昵称、简介及粉丝数量；若账号已实名认证，截图认证标志；若知晓对方手机号或身份证号，记录备用。',
    },
    {
      group: '传播范围证据',
      desc: '转发、评论、被关注亲友列表',
      guide: '截图视频转发记录和评论区互动；进入「关注」列表，截图其关注了你哪些亲友同事，证明侵权行为具有针对性。',
    },
    {
      group: '平台举报记录',
      desc: '向抖音、微博等平台举报的凭证',
      guide: '完成平台举报操作后截图「举报成功」页面或保存回执邮件；若平台已删除内容，截图「内容已删除」提示页作为佐证。',
    },
    {
      group: '损害后果证明',
      desc: '因此事造成的实际损害证明',
      guide: '若被公司辞退，保存相关书面通知；若亲友发来质询，截图对话；若就医治疗，保留病历和发票。',
    },
  ]

  const analysis = {
    summary: '前任在社交平台持续发布诽谤内容，构成名誉侵权',
    strength: 72,
    strengthNote: '侵权事实清晰，传播范围可量化，胜诉基础较好',
    keyPoints: [
      '名誉权侵权成立要件：捏造事实 + 公开传播 + 造成损害',
      '平台播放量可作为传播范围的量化依据',
      '定向关注亲友可证明主观恶意',
    ],
    risks: [
      '截图真实性需经公证方可作为正式证据',
      '对方可能主张内容为「真实陈述」，需原告举证反驳',
    ],
    suggestion: '立即对全部侵权视频进行公证存证，防止对方删除后证据灭失',
  }

  const demoCase = await db.case.create({
    data: {
      userId,
      isDemo:   true,
      type:     '网络侵权',
      goal:     '要求对方道歉并删除内容',
      desc:     '2026年1月起，前任李某某（抖音账号"晨光旅记"）在抖音持续发布多条针对本人的诽谤视频，捏造本人存在欺诈行为，视频播放量累计超过20万次，导致多名亲友向本人询问，严重损害了本人名誉和社会评价。',
      status:   'active',
      groups:   JSON.stringify(groups),
      guide:    JSON.stringify(guide),
      analysis: JSON.stringify(analysis),
      plaintiff: {
        create: { name: '张某某', gender: 'female', age: 28, region: '广东省深圳市' },
      },
      defendant: {
        create: { name: '李某某', gender: 'male', rel: '前任伴侣' },
      },
      evidence: {
        create: [
          {
            filename: 'demo_侵权视频截图.png',
            filepath: '',
            mimetype: 'image/png',
            status:   'valid',
            evType:   '视频截图',
            group:    '侵权视频证据',
            verdict:  '抖音侵权视频截图，含账号名、发布时间及播放量，证明力较强',
            aiVerified: true,
            isDemo:   true,
          },
          {
            filename: 'demo_账号主页.png',
            filepath: '',
            mimetype: 'image/png',
            status:   'valid',
            evType:   '账号截图',
            group:    '被告身份证据',
            verdict:  '被告抖音账号主页，含粉丝数及实名认证信息',
            aiVerified: true,
            isDemo:   true,
          },
          {
            filename: 'demo_举报回执.png',
            filepath: '',
            mimetype: 'image/png',
            status:   'valid',
            evType:   '举报记录',
            group:    '平台举报记录',
            verdict:  '平台举报成功截图，含受理编号和时间戳',
            aiVerified: true,
            isDemo:   true,
          },
        ],
      },
    },
    include: { plaintiff: true, defendant: true, evidence: true },
  })

  return demoCase
}
