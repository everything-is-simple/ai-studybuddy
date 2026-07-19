import { useEffect, useState, type ReactNode } from 'react';
import { ApiClientError } from '../api/api-client';
import {
  getConfigurationPresets,
  getConfigurationStatus,
  retestConfiguration,
  testAndActivate,
  type AiProviderPreset,
  type ChannelStatus,
  type ConfigurationPresets,
  type ConfigurationStatus,
  type CustomAiCandidate,
  type OfficialAiCandidate,
  type ProviderPresetGroup,
} from '../api/configuration-api';

type ConfigChannel = 'ai' | 'smtp' | 'feishu';
type ProviderDraft = Omit<OfficialAiCandidate, 'priority'> | Omit<CustomAiCandidate, 'priority'>;

interface SmtpForm {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  authCode: string;
  to: string;
}

interface CustomProviderForm {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

const emptyPresets: ConfigurationPresets = {
  ai: [],
  smtp: { host: 'smtp.qq.com', port: 465, secure: true, userHint: '', authCodeHint: '', recipientHint: '' },
  feishu: { webhookHint: '', securityHint: '' },
  customProviderHint: '',
};

const blankSmtp = (): SmtpForm => ({ host: 'smtp.qq.com', port: 465, secure: true, user: '', authCode: '', to: '' });
const blankCustomProvider = (): CustomProviderForm => ({ name: '', baseUrl: '', apiKey: '', model: '' });

const channelLabels: Record<ConfigChannel, string> = {
  ai: 'AI Provider',
  smtp: 'QQ SMTP',
  feishu: '飞书 Webhook',
};

const providerGroupLabels: Record<ProviderPresetGroup, string> = {
  international: '国外主流',
  mainland: '国内主流',
  alternative: '国内外备选',
};

const providerGroupOrder: ProviderPresetGroup[] = ['international', 'mainland', 'alternative'];

export default function SettingsPage() {
  const [status, setStatus] = useState<ConfigurationStatus | null>(null);
  const [presets, setPresets] = useState<ConfigurationPresets>(emptyPresets);
  const [officialDrafts, setOfficialDrafts] = useState<Record<string, { apiKey: string; model: string }>>({});
  const [fallbackProviders, setFallbackProviders] = useState<ProviderDraft[]>([]);
  const [customProvider, setCustomProvider] = useState<CustomProviderForm>(blankCustomProvider);
  const [smtp, setSmtp] = useState<SmtpForm>(blankSmtp);
  const [feishu, setFeishu] = useState({ webhookUrl: '' });
  const [busy, setBusy] = useState<ConfigChannel | null>(null);
  const [message, setMessage] = useState<Partial<Record<ConfigChannel | 'runtime', string>>>({});

  const refreshStatus = async () => setStatus(await getConfigurationStatus());

  useEffect(() => {
    void Promise.all([getConfigurationStatus(), getConfigurationPresets()])
      .then(([nextStatus, nextPresets]) => {
        setStatus(nextStatus);
        setPresets(nextPresets);
        setSmtp((current) => ({ ...current, host: nextPresets.smtp.host, port: nextPresets.smtp.port, secure: nextPresets.smtp.secure }));
      })
      .catch(() => setMessage({ runtime: '后端连接失败，暂时无法读取配置预设' }));
  }, []);

  async function activate(channel: ConfigChannel, value: unknown) {
    setBusy(channel);
    setMessage((old) => ({ ...old, [channel]: '' }));
    try {
      await testAndActivate(channel, value);
      setMessage((old) => ({ ...old, [channel]: '连接通过，配置已激活' }));
      await refreshStatus();
    } catch (error) {
      const code = error instanceof ApiClientError ? error.code : 'CONFIG_REQUEST_FAILED';
      setMessage((old) => ({ ...old, [channel]: `测试失败：${code}` }));
    } finally {
      clearSecretFields(channel);
      setBusy(null);
    }
  }

  async function retest(channel: ConfigChannel) {
    setBusy(channel);
    setMessage((old) => ({ ...old, [channel]: '' }));
    try {
      await retestConfiguration(channel);
      setMessage((old) => ({ ...old, [channel]: '重新测试通过' }));
      await refreshStatus();
    } catch (error) {
      const code = error instanceof ApiClientError ? error.code : 'CONFIG_REQUEST_FAILED';
      setMessage((old) => ({ ...old, [channel]: `重新测试失败：${code}` }));
    } finally {
      setBusy(null);
    }
  }

  function clearSecretFields(channel: ConfigChannel) {
    if (channel === 'ai') {
      setOfficialDrafts((current) => Object.fromEntries(Object.entries(current).map(([id, draft]) => [id, { ...draft, apiKey: '' }])));
      setFallbackProviders([]);
      setCustomProvider((current) => ({ ...current, apiKey: '' }));
    }
    if (channel === 'smtp') setSmtp((current) => ({ ...current, authCode: '' }));
    if (channel === 'feishu') setFeishu({ webhookUrl: '' });
  }

  function updateOfficialDraft(preset: AiProviderPreset, patch: Partial<{ apiKey: string; model: string }>) {
    setOfficialDrafts((current) => ({
      ...current,
      [preset.id]: { apiKey: current[preset.id]?.apiKey ?? '', model: current[preset.id]?.model ?? preset.defaultModel, ...patch },
    }));
  }

  function addOfficialProvider(preset: AiProviderPreset) {
    const draft = officialDrafts[preset.id] ?? { apiKey: '', model: preset.defaultModel };
    if (!draft.apiKey.trim()) {
      setMessage((old) => ({ ...old, ai: '请先粘贴 API Key' }));
      return;
    }
    setFallbackProviders((current) => [...current, { kind: 'official', presetId: preset.id, apiKey: draft.apiKey, model: draft.model }]);
    updateOfficialDraft(preset, { apiKey: '' });
  }

  function addCustomProvider() {
    if (!customProvider.name.trim() || !customProvider.baseUrl.trim() || !customProvider.apiKey.trim() || !customProvider.model.trim()) {
      setMessage((old) => ({ ...old, ai: '请填写完整的自定义 Provider 配置' }));
      return;
    }
    setFallbackProviders((current) => [...current, { kind: 'custom', ...customProvider }]);
    setCustomProvider(blankCustomProvider());
  }

  function activateAi() {
    const providers = fallbackProviders.map((provider, index) => ({ ...provider, priority: index + 1 }));
    void activate('ai', { providers });
  }

  return (
    <section className="page settings-page">
      <header className="page-header">
        <div>
          <h1>本机配置中心</h1>
          <p>连接信息只保存在当前 Windows 用户的加密存储中，密钥不会回显。</p>
        </div>
      </header>

      <section className="settings-card" aria-labelledby="runtime-title">
        <h2 id="runtime-title">运行状态</h2>
        {status ? (
          <div className="runtime-grid">
            <Status label="数据目录" ok={status.runtime.dataDir} />
            <Status label="AI" ok={status.runtime.aiAvailable} />
            <Status label="QQ SMTP" ok={status.runtime.smtpAvailable} />
            <Status label="飞书" ok={status.runtime.feishuAvailable} />
            <span>后端运行 {status.runtime.uptime} 秒</span>
            <span>Node {status.runtime.nodeVersion}</span>
          </div>
        ) : <p>{message.runtime ?? '正在读取状态和预设…'}</p>}
      </section>

      <ConfigCard headingId="ai-config-title" title={channelLabels.ai} state={status?.ai} busy={busy === 'ai'} message={message.ai} onRetest={() => void retest('ai')}>
        <p className="settings-note">按优先级失败切换 + 冷却，不是成功请求轮询。</p>
        {providerGroupOrder.map((group) => {
          const providers = presets.ai.filter((preset) => preset.group === group);
          if (!providers.length) return null;
          return <section className="provider-preset-group" key={group} aria-label={providerGroupLabels[group]}>
            <h3>{providerGroupLabels[group]}</h3>
            <div className="provider-preset-grid">
              {providers.map((preset) => <ProviderPresetCard key={preset.id} preset={preset} draft={officialDrafts[preset.id] ?? { apiKey: '', model: preset.defaultModel }} onChange={(patch) => updateOfficialDraft(preset, patch)} onAdd={() => addOfficialProvider(preset)} />)}
            </div>
          </section>;
        })}
        <FallbackList providers={fallbackProviders} presets={presets.ai} onMove={(from, to) => setFallbackProviders((current) => moveItem(current, from, to))} onRemove={(index) => setFallbackProviders((current) => current.filter((_, currentIndex) => currentIndex !== index))} />
        <details className="advanced-config" data-testid="custom-provider-advanced">
          <summary>高级自定义 Provider / 中转站</summary>
          <p className="settings-note">{presets.customProviderHint}</p>
          <div className="settings-form">
            <TextInput label="名称" testId="custom-provider-name" value={customProvider.name} onChange={(name) => setCustomProvider((current) => ({ ...current, name }))} />
            <TextInput label="API 地址" testId="custom-provider-base-url" value={customProvider.baseUrl} onChange={(baseUrl) => setCustomProvider((current) => ({ ...current, baseUrl }))} />
            <TextInput label="API Key" type="password" testId="custom-provider-api-key" value={customProvider.apiKey} onChange={(apiKey) => setCustomProvider((current) => ({ ...current, apiKey }))} />
            <TextInput label="模型" testId="custom-provider-model" value={customProvider.model} onChange={(model) => setCustomProvider((current) => ({ ...current, model }))} />
          </div>
          <button type="button" className="button-secondary" onClick={addCustomProvider}>加入自定义 Provider</button>
        </details>
        <div className="settings-actions">
          <button type="button" disabled={busy === 'ai' || fallbackProviders.length === 0} onClick={activateAi}>测试并激活 AI</button>
        </div>
      </ConfigCard>

      <ConfigCard headingId="smtp-config-title" title={channelLabels.smtp} state={status?.smtp} busy={busy === 'smtp'} message={message.smtp} onRetest={() => void retest('smtp')}>
        <div className="settings-form">
          <TextInput label="QQ 邮箱账号" testId="smtp-user" value={smtp.user} onChange={(user) => setSmtp((current) => ({ ...current, user }))} />
          <TextInput label="SMTP 授权码" type="password" testId="smtp-auth-code" value={smtp.authCode} onChange={(authCode) => setSmtp((current) => ({ ...current, authCode }))} />
          <TextInput label="收件邮箱" testId="smtp-to" value={smtp.to} onChange={(to) => setSmtp((current) => ({ ...current, to }))} />
        </div>
        <p className="settings-note">SMTP 授权码不是 QQ 登录密码。</p>
        <details className="advanced-config" data-testid="smtp-advanced">
          <summary>高级 SMTP 参数</summary>
          <div className="settings-form">
            <TextInput label="服务器" testId="smtp-host" value={smtp.host} onChange={(host) => setSmtp((current) => ({ ...current, host }))} />
            <label>端口<input data-testid="smtp-port" type="number" value={smtp.port} onChange={(event) => setSmtp((current) => ({ ...current, port: Number(event.target.value) }))} /></label>
            <label className="checkbox"><input type="checkbox" checked={smtp.secure} onChange={(event) => setSmtp((current) => ({ ...current, secure: event.target.checked }))} />SSL/TLS 安全连接</label>
          </div>
        </details>
        <button type="button" disabled={busy === 'smtp'} onClick={() => void activate('smtp', smtp)}>测试并激活 SMTP</button>
      </ConfigCard>

      <ConfigCard headingId="feishu-config-title" title={channelLabels.feishu} state={status?.feishu} busy={busy === 'feishu'} message={message.feishu} onRetest={() => void retest('feishu')}>
        <TextInput label="飞书群机器人 Webhook URL" type="password" testId="feishu-webhook-url" value={feishu.webhookUrl} onChange={(webhookUrl) => setFeishu({ webhookUrl })} />
        <p className="settings-note">{presets.feishu.securityHint || 'Webhook 会加密保存在本机、页面不回显、不要复制到截图或提交到 Git。'}</p>
        <button type="button" disabled={busy === 'feishu'} onClick={() => void activate('feishu', feishu)}>测试并激活飞书</button>
      </ConfigCard>
    </section>
  );
}

function ProviderPresetCard({ preset, draft, onChange, onAdd }: { preset: AiProviderPreset; draft: { apiKey: string; model: string }; onChange: (patch: Partial<{ apiKey: string; model: string }>) => void; onAdd: () => void }) {
  const unavailable = preset.availability !== 'available' || preset.protocol !== 'openai-compatible';
  return <article className="provider-preset-card">
    <h4>{preset.displayName}</h4>
    <p>{preset.description}</p>
    <p className="provider-base-url"><span>官方 API 地址</span><code>{preset.baseUrl}</code></p>
    {unavailable ? <button type="button" disabled>{preset.displayName}（后续适配）</button> : <>
      <label>模型<select data-testid={`official-${preset.id}-model`} value={draft.model} onChange={(event) => onChange({ model: event.target.value })}>{preset.modelSuggestions.map((model) => <option key={model} value={model}>{model}</option>)}</select></label>
      <TextInput label="API Key" type="password" testId={`official-${preset.id}-api-key`} value={draft.apiKey} onChange={(apiKey) => onChange({ apiKey })} />
      <button type="button" className="button-secondary" onClick={onAdd}>加入 fallback</button>
    </>}
  </article>;
}

function FallbackList({ providers, presets, onMove, onRemove }: { providers: ProviderDraft[]; presets: AiProviderPreset[]; onMove: (from: number, to: number) => void; onRemove: (index: number) => void }) {
  if (!providers.length) return <p className="settings-note">还没有加入 fallback 的 Provider。</p>;
  return <section className="fallback-list" aria-label="Provider fallback 优先级"><h3>Provider fallback 优先级</h3><ol>{providers.map((provider, index) => {
    const label = provider.kind === 'official' ? presets.find((preset) => preset.id === provider.presetId)?.displayName ?? provider.presetId : provider.name;
    return <li key={`${provider.kind}-${index}`}><div><strong>{label}</strong><span>{provider.model} · 优先级 {index + 1}</span></div><div className="fallback-actions"><button type="button" className="button-secondary" disabled={index === 0} onClick={() => onMove(index, index - 1)}>上移</button><button type="button" className="button-secondary" disabled={index === providers.length - 1} onClick={() => onMove(index, index + 1)}>下移</button><button type="button" className="button-secondary" onClick={() => onRemove(index)}>移除</button></div></li>;
  })}</ol></section>;
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function Status({ label, ok }: { label: string; ok: boolean }) { return <span><strong>{label}</strong>：{ok ? '可用' : '未配置 / 降级'}</span>; }

function TextInput({ label, value, onChange, testId, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; testId: string; type?: 'text' | 'password' }) {
  return <label>{label}<input data-testid={testId} type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function ConfigCard({ headingId, title, state, busy, message, onRetest, children }: { headingId: string; title: string; state?: ChannelStatus; busy: boolean; message?: string; onRetest: () => void; children: ReactNode }) {
  const verified = state?.status === 'verified_pass';
  return <section className="settings-card" aria-labelledby={headingId}>
    <div className="settings-card-head"><h2 id={headingId}>{title}</h2><span className={`status-badge ${verified ? 'status-success' : ''}`}>{verified ? '已通过' : '未配置'}</span></div>
    {state?.summary && <p>{state.summary} · {state.lastVerified ?? '验证时间未知'}</p>}
    {state?.errorCode && <p className="semester-error">{state.errorCode}</p>}
    {children}
    <div className="settings-actions">{verified && <button type="button" className="button-secondary" disabled={busy} onClick={onRetest}>重新测试</button>}{message && <span role="status">{message}</span>}</div>
  </section>;
}
