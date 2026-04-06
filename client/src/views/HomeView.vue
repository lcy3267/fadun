<template>
  <div class="home">

    <!-- Nav -->
    <nav class="hn">
      <div class="logo">
        <div class="logo-seal"><span>盾</span></div>
        <span class="logo-txt">法盾</span>
      </div>
      <div v-if="!auth.isLoggedIn" style="display:flex;gap:10px">
        <button class="hb-ghost" style="padding:9px 20px;font-size:13px" @click="showLogin=true">登录</button>
        <button class="hb-main"  style="padding:9px 20px;font-size:13px" @click="showRegister=true">免费注册</button>
      </div>
    </nav>

    <!-- Hero -->
    <section class="hero">
      <div class="hero-inner">
        <div class="hero-pill">AI 服务中</div>
        <div class="hero-h">让<em>每个人</em><br>都敢于维权</div>
        <div class="hero-sub">AI 法律援助 · 证据智能分析 · 维权文书一键生成</div>
        <div class="hero-btns">
          <button class="hb-main" @click="handleStart">立即开始维权</button>
          <button class="hb-ghost" @click="scrollTo('sec-cases')">查看示范案例</button>
        </div>
        <div class="stats">
          <div class="st">
            <div class="st-n">1,800<span style="font-size:17px">万+</span></div>
            <div class="st-l">中国每年民事案件数量</div>
          </div>
          <div class="st">
            <div class="st-n">7</div>
            <div class="st-l">大类维权场景覆盖</div>
          </div>
          <div class="st">
            <div class="st-n">3</div>
            <div class="st-l">步完成维权文书生成</div>
          </div>
          <div class="st">
            <div class="st-n">0<span style="font-size:17px">元</span></div>
            <div class="st-l">基础功能完全免费</div>
          </div>
        </div>
      </div>
    </section>

    <!-- 示范案例 -->
    <section class="sec-cases" id="sec-cases">
      <div class="sec-hd">
        <div class="sec-ey">示范案例</div>
        <div class="sec-t">他们用法盾成功维权</div>
        <div class="sec-s">以下案例基于真实情景改编，当事人信息已脱敏处理</div>
      </div>
      <div class="cases-g">
        <div class="cc">
          <div class="cc-badge">📱 网络侵权</div>
          <div class="cc-h">前任在社交平台散布谣言，播放量逾50万</div>
          <div class="cc-d">当事人被前男友在抖音、微博发布大量捏造内容，定向传播至其亲属朋友圈，造成严重名誉损害及精神伤害。</div>
          <div class="cc-r">通过法盾整理7份有效证据，生成陈述书后向平台投诉，成功删除全部内容，并获赔精神损害抚慰金1.2万元。</div>
        </div>
        <div class="cc">
          <div class="cc-badge">⚖️ 劳动纠纷</div>
          <div class="cc-h">公司违法辞退，拒付三个月工资及赔偿金</div>
          <div class="cc-d">当事人被公司以"业绩不达标"为由口头辞退，既无书面通知，也未支付任何经济补偿，工资拖欠三个月。</div>
          <div class="cc-r">上传劳动合同、工资流水、微信通知截图共5份证据，生成仲裁申请书，劳动仲裁裁决公司支付共计4.8万元。</div>
        </div>
        <div class="cc">
          <div class="cc-badge">🛒 消费维权</div>
          <div class="cc-h">购买二手车被隐瞒重大事故记录</div>
          <div class="cc-d">当事人购买二手车后发现卖家隐瞒车辆有重大事故记录，检测报告与实际严重不符，要求退车遭拒。</div>
          <div class="cc-r">AI分析检测报告差异，生成投诉书提交市场监管局，最终全额退款并额外获赔3倍差价。</div>
        </div>
      </div>
    </section>

    <!-- 核心功能 -->
    <section class="sec-feat">
      <div class="sec-hd">
        <div class="sec-ey" style="color:rgba(154,120,32,.8)">核心功能</div>
        <div class="sec-t" style="color:#fff">专为普通人设计的维权工具</div>
      </div>
      <div class="feat-g">
        <div class="fc">
          <div class="fc-ic">🧠</div>
          <div class="fc-h">AI 证据有效性判断</div>
          <div class="fc-d">上传截图、文档，AI 自动分析每份材料的证明力，告诉你哪些有用、哪些不够。</div>
        </div>
        <div class="fc">
          <div class="fc-ic">📋</div>
          <div class="fc-h">定制证据收集清单</div>
          <div class="fc-d">根据你的案件类型和案情，自动生成专属证据清单，上传后自动归类，脉络清晰。</div>
        </div>
        <div class="fc">
          <div class="fc-ic">📄</div>
          <div class="fc-h">一键生成维权文书</div>
          <div class="fc-d">生成结构完整的维权陈述书，附带证据图片可下载 PDF，可直接用于报案或律师咨询。</div>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <div class="hfooter">
      <div class="hfooter-l">© 2026 法盾 · AI法律援助平台 · 本平台提供法律信息参考，正式法律行动请咨询持证律师</div>
      <div class="hfooter-r">湘ICP备2026010900号-1</div>
    </div>

    <LoginModal    v-model="showLogin"    @switch="showLogin=false;showRegister=true" />
    <RegisterModal v-model="showRegister" @switch="showRegister=false;showLogin=true" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import LoginModal    from '@/components/auth/LoginModal.vue'
import RegisterModal from '@/components/auth/RegisterModal.vue'

const router = useRouter()
const auth   = useAuthStore()

const showLogin    = ref(false)
const showRegister = ref(false)

function scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}

function handleStart() {
  if (auth.isLoggedIn) {
    router.push('/app')
  } else {
    showRegister.value = true
  }
}
</script>

<style scoped>
.home { background: var(--ink); overflow-x: hidden; }

/* ── Nav ───────────────────────────────────────── */
.hn {
  position: fixed; top: 0; left: 0; right: 0; z-index: 200;
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 56px;
  background: rgba(13,10,6,.82); backdrop-filter: blur(14px);
  border-bottom: 1px solid rgba(154,120,32,.12);
}
.logo { display: flex; align-items: center; gap: 11px; cursor: pointer; }
.logo-seal {
  width: 36px; height: 36px; background: var(--seal); border-radius: 5px;
  display: flex; align-items: center; justify-content: center;
  transform: rotate(3deg); box-shadow: 2px 3px 10px rgba(139,26,26,.45);
  position: relative; flex-shrink: 0;
}
.logo-seal::before { content: ''; position: absolute; inset: 3px; border: 1px solid rgba(255,255,255,.22); border-radius: 3px; }
.logo-seal span { font-family: 'Noto Serif SC', serif; color: #fff; font-size: 17px; font-weight: 900; transform: rotate(-3deg); }
.logo-txt { font-family: 'Noto Serif SC', serif; font-size: 18px; font-weight: 700; color: #fff; letter-spacing: .06em; }

/* ── Hero ──────────────────────────────────────── */
.hero {
  min-height: 100vh; display: flex; align-items: center; justify-content: center;
  padding: 110px 56px 80px; position: relative;
  background:
    radial-gradient(ellipse 70% 60% at 28% 44%, rgba(139,26,26,.2) 0%, transparent 65%),
    radial-gradient(ellipse 50% 50% at 80% 75%, rgba(154,120,32,.12) 0%, transparent 55%);
}
.hero::before {
  content: ''; position: absolute; inset: 0;
  background-image:
    repeating-linear-gradient(0deg, transparent, transparent 63px, rgba(154,120,32,.035) 64px),
    repeating-linear-gradient(90deg, transparent, transparent 63px, rgba(154,120,32,.035) 64px);
}
.hero-inner { text-align: center; position: relative; z-index: 1; max-width: 780px; }
.hero-pill {
  display: inline-flex; align-items: center; gap: 7px;
  background: rgba(154,120,32,.13); border: 1px solid rgba(154,120,32,.28);
  border-radius: 20px; padding: 5px 15px;
  font-size: 11.5px; color: #c49a28; letter-spacing: .14em; margin-bottom: 26px;
}
.hero-pill::before {
  content: ''; width: 6px; height: 6px;
  background: #c49a28; border-radius: 50%; animation: blink 2.2s infinite;
}
@keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
.hero-h {
  font-family: 'Noto Serif SC', serif; font-size: 58px; font-weight: 900;
  color: #fff; line-height: 1.18; letter-spacing: .03em; margin-bottom: 8px;
}
.hero-h em { color: #c49a28; font-style: normal; }
.hero-sub { font-size: 16px; color: rgba(255,255,255,.5); margin-bottom: 38px; letter-spacing: .06em; }
.hero-btns { display: flex; gap: 13px; justify-content: center; flex-wrap: wrap; }

.hb-main {
  padding: 14px 38px; background: var(--seal); color: #fff; border: none; border-radius: 10px;
  font-size: 15.5px; font-weight: 600; cursor: pointer;
  font-family: 'Noto Sans SC', sans-serif; transition: all .2s; letter-spacing: .04em;
}
.hb-main:hover { background: var(--seal2); transform: translateY(-2px); box-shadow: 0 8px 28px rgba(139,26,26,.38); }
.hb-ghost {
  padding: 14px 38px; background: transparent; color: rgba(255,255,255,.75);
  border: 1.5px solid rgba(255,255,255,.18); border-radius: 10px;
  font-size: 15.5px; font-weight: 500; cursor: pointer;
  font-family: 'Noto Sans SC', sans-serif; transition: all .2s;
}
.hb-ghost:hover { border-color: rgba(255,255,255,.45); color: #fff; }

/* ── Stats ─────────────────────────────────────── */
.stats {
  display: flex; margin-top: 60px;
  background: rgba(255,255,255,.04); border: 1px solid rgba(154,120,32,.18);
  border-radius: var(--rl); overflow: hidden;
}
.st { flex: 1; padding: 20px 24px; text-align: center; border-right: 1px solid rgba(154,120,32,.13); }
.st:last-child { border-right: none; }
.st-n { font-family: 'Noto Serif SC', serif; font-size: 28px; font-weight: 700; color: #c49a28; }
.st-l { font-size: 11.5px; color: rgba(255,255,255,.4); margin-top: 2px; letter-spacing: .04em; }

/* ── Cases ─────────────────────────────────────── */
.sec-cases { background: var(--paper); padding: 76px 56px; }
.sec-hd { text-align: center; margin-bottom: 44px; }
.sec-ey { font-size: 11.5px; color: var(--gold); letter-spacing: .22em; font-weight: 600; margin-bottom: 8px; }
.sec-t  { font-family: 'Noto Serif SC', serif; font-size: 32px; font-weight: 700; color: var(--ink); }
.sec-s  { font-size: 13.5px; color: var(--gray2); margin-top: 7px; }
.cases-g { display: grid; grid-template-columns: repeat(3,1fr); gap: 18px; max-width: 1080px; margin: 0 auto; }
.cc {
  background: #fff; border: 1px solid var(--bdr); border-radius: var(--rl);
  padding: 24px; box-shadow: var(--sh1); transition: all .28s;
  position: relative; overflow: hidden;
}
.cc::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--seal); }
.cc:hover { transform: translateY(-4px); box-shadow: var(--sh2); }
.cc-badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 11px; background: var(--gold-lt); border-radius: 20px; font-size: 11px; color: var(--gold); font-weight: 600; margin-bottom: 13px; }
.cc-h { font-family: 'Noto Serif SC', serif; font-size: 15.5px; font-weight: 700; color: var(--ink); margin-bottom: 9px; line-height: 1.55; }
.cc-d { font-size: 12.5px; color: var(--gray); line-height: 1.85; margin-bottom: 14px; }
.cc-r { background: var(--green-lt); border-radius: 8px; padding: 9px 13px; font-size: 12px; color: var(--green); font-weight: 500; line-height: 1.65; }
.cc-r::before { content: '✓  '; }

/* ── Features ──────────────────────────────────── */
.sec-feat { background: var(--ink); padding: 76px 56px; }
.feat-g { display: grid; grid-template-columns: repeat(3,1fr); gap: 20px; max-width: 1080px; margin: 0 auto; }
.fc { background: rgba(255,255,255,.04); border: 1px solid rgba(154,120,32,.13); border-radius: var(--rl); padding: 26px; }
.fc-ic { width: 42px; height: 42px; background: rgba(139,26,26,.22); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 19px; margin-bottom: 14px; }
.fc-h { font-family: 'Noto Serif SC', serif; font-size: 15.5px; font-weight: 700; color: #fff; margin-bottom: 7px; }
.fc-d { font-size: 12.5px; color: rgba(255,255,255,.46); line-height: 1.85; }

/* ── Footer ────────────────────────────────────── */
.hfooter {
  background: var(--ink); border-top: 1px solid rgba(154,120,32,.12);
  padding: 20px 56px; display: flex; align-items: center; justify-content: space-between;
}
.hfooter-l { font-size: 11.5px; color: rgba(255,255,255,.28); }
.hfooter-r { font-size: 11.5px; color: rgba(154,120,32,.55); }

/* ── Responsive ────────────────────────────────── */
@media (max-width: 768px) {
  .hn { padding: 14px 20px; }
  .hero { padding: 90px 24px 60px; }
  .hero-h { font-size: 36px; }
  .stats { flex-wrap: wrap; }
  .st { min-width: 50%; border-bottom: 1px solid rgba(154,120,32,.13); }
  .sec-cases, .sec-feat { padding: 56px 24px; }
  .cases-g, .feat-g { grid-template-columns: 1fr; }
  .hfooter { padding: 16px 20px; flex-direction: column; gap: 6px; text-align: center; }
}
</style>
