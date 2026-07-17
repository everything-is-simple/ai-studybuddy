import { useEffect, useState, type ReactNode } from 'react';
import { ApiClientError } from '../api/api-client';
import {
  getConfigurationStatus,
  retestConfiguration,
  testAndActivate,
  type ChannelStatus,
  type ConfigurationStatus,
  type ProviderForm,
} from '../api/configuration-api';

type ConfigChannel = 'ai' | 'smtp' | 'feishu';

interface SmtpForm {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  authCode: string;
  to: string;
}

const blankProvider = (): ProviderForm => ({
  name: '',
  baseUrl: '',
  apiKey: '',
  model: '',
  priority: 1,
});

const blankSmtp = (): SmtpForm => ({
  host: 'smtp.qq.com',
  port: 465,
  secure: true,
  user: '',
  authCode: '',
  to: '',
});

const channelLabels: Record<ConfigChannel, string> = {
  ai: 'AI Provider',
  smtp: 'QQ SMTP',
  feishu: '飞书 Webhook',
};

export default function SettingsPage() {
  const [status, setStatus] = useState<ConfigurationStatus | null>(null);
  const [providers, setProviders] = useState<ProviderForm[]>([blankProvider()]);
  const [smtp, setSmtp] = useState<SmtpForm>(blankSmtp);
  const [feishu, setFeishu] = useState({ webhookUrl: '' });
  const [busy, setBusy] = useState<ConfigChannel | null>(null);
  const [message, setMessage] = useState<Partial<Record<ConfigChannel | 'runtime', string>>>({});

  const refresh = async () => setStatus(await getConfigurationStatus());

  useEffect(() => {
    void refresh().catch(() => setMessage({ runtime: '后端连接失败' }));
  }, []);

  async function activate(channel: ConfigChannel, value: unknown) {
    setBusy(channel);
    setMessage((old) => ({ ...old, [channel]: '' }));
    try {
      await testAndActivate(channel, value);
      setMessage((old) => ({ ...old, [channel]: '连接通过，配置已激活' }));
      clearSecretFields(channel);
      await refresh();
    } catch (error) {
      const code = error instanceof ApiClientError ? error.code : 'CONFIG_REQUEST_FAILED';
      setMessage((old) => ({ ...old, [channel]: `测试失败：${code}` }));
    } finally {
      setBusy(null);
    }
  }

  async function retest(channel: ConfigChannel) {
    setBusy(channel);
    setMessage((old) => ({ ...old, [channel]: '' }));
    try {
      await retestConfiguration(channel);
      setMessage((old) => ({ ...old, [channel]: '重新测试通过' }));
      await refresh();
    } catch (error) {
      const code = error instanceof ApiClientError ? error.code : 'CONFIG_REQUEST_FAILED';
      setMessage((old) => ({ ...old, [channel]: `重新测试失败：${code}` }));
    } finally {
      setBusy(null);
    }
  }

  function clearSecretFields(channel: ConfigChannel) {
    if (channel === 'ai') {
      setProviders((rows) => rows.map((row) => ({ ...row, apiKey: '' })));
    }
    if (channel === 'smtp') {
      setSmtp((old) => ({ ...old, authCode: '' }));
    }
    if (channel === 'feishu') {
      setFeishu({ webhookUrl: '' });
    }
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
        ) : (
          <p>{message.runtime ?? '正在读取状态…'}</p>
        )}
      </section>

      <ConfigCard
        headingId="ai-config-title"
        title={channelLabels.ai}
        state={status?.ai}
        busy={busy === 'ai'}
        message={message.ai}
        onRetest={() => retest('ai')}
      >
        {providers.map((provider, index) => (
          <div className="provider-row" key={index}>
            <TextInput
              label="名称"
              testId={`ai-provider-${index}-name`}
              value={provider.name}
              onChange={(value) => updateProvider(index, { name: value })}
            />
            <TextInput
              label="API 地址"
              testId={`ai-provider-${index}-base-url`}
              value={provider.baseUrl}
              onChange={(value) => updateProvider(index, { baseUrl: value })}
            />
            <TextInput
              label="API Key"
              type="password"
              testId={`ai-provider-${index}-api-key`}
              value={provider.apiKey}
              onChange={(value) => updateProvider(index, { apiKey: value })}
            />
            <TextInput
              label="模型"
              testId={`ai-provider-${index}-model`}
              value={provider.model}
              onChange={(value) => updateProvider(index, { model: value })}
            />
            <label>
              优先级
              <input
                data-testid={`ai-provider-${index}-priority`}
                type="number"
                min="1"
                max="100"
                value={provider.priority}
                onChange={(event) => updateProvider(index, { priority: Number(event.target.value) })}
              />
            </label>
            {providers.length > 1 && (
              <button
                type="button"
                className="button-secondary"
                onClick={() => setProviders((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}
              >
                删除
              </button>
            )}
          </div>
        ))}
        <div className="settings-actions">
          <button
            type="button"
            className="button-secondary"
            onClick={() => setProviders((rows) => [...rows, { ...blankProvider(), priority: rows.length + 1 }])}
          >
            添加 Provider
          </button>
          <button type="button" disabled={busy === 'ai'} onClick={() => activate('ai', { providers })}>
            测试并激活 AI
          </button>
        </div>
      </ConfigCard>

      <ConfigCard
        headingId="smtp-config-title"
        title={channelLabels.smtp}
        state={status?.smtp}
        busy={busy === 'smtp'}
        message={message.smtp}
        onRetest={() => retest('smtp')}
      >
        <div className="settings-form">
          <TextInput label="服务器" testId="smtp-host" value={smtp.host} onChange={(value) => setSmtp({ ...smtp, host: value })} />
          <label>
            端口
            <input
              data-testid="smtp-port"
              type="number"
              value={smtp.port}
              onChange={(event) => setSmtp({ ...smtp, port: Number(event.target.value) })}
            />
          </label>
          <TextInput label="发件账号" testId="smtp-user" value={smtp.user} onChange={(value) => setSmtp({ ...smtp, user: value })} />
          <TextInput
            label="授权码"
            type="password"
            testId="smtp-auth-code"
            value={smtp.authCode}
            onChange={(value) => setSmtp({ ...smtp, authCode: value })}
          />
          <TextInput label="收件邮箱" testId="smtp-to" value={smtp.to} onChange={(value) => setSmtp({ ...smtp, to: value })} />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={smtp.secure}
              onChange={(event) => setSmtp({ ...smtp, secure: event.target.checked })}
            />
            安全连接
          </label>
        </div>
        <button type="button" disabled={busy === 'smtp'} onClick={() => activate('smtp', smtp)}>
          测试并激活 SMTP
        </button>
      </ConfigCard>

      <ConfigCard
        headingId="feishu-config-title"
        title={channelLabels.feishu}
        state={status?.feishu}
        busy={busy === 'feishu'}
        message={message.feishu}
        onRetest={() => retest('feishu')}
      >
        <TextInput
          label="Webhook 地址"
          type="password"
          testId="feishu-webhook-url"
          value={feishu.webhookUrl}
          onChange={(value) => setFeishu({ webhookUrl: value })}
        />
        <button type="button" disabled={busy === 'feishu'} onClick={() => activate('feishu', feishu)}>
          测试并激活飞书
        </button>
      </ConfigCard>
    </section>
  );

  function updateProvider(index: number, patch: Partial<ProviderForm>) {
    setProviders((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }
}

function Status({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span>
      <strong>{label}</strong>：{ok ? '可用' : '未配置 / 降级'}
    </span>
  );
}

function TextInput({
  label,
  value,
  onChange,
  testId,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  testId: string;
  type?: 'text' | 'password';
}) {
  return (
    <label>
      {label}
      <input data-testid={testId} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ConfigCard({
  headingId,
  title,
  state,
  busy,
  message,
  onRetest,
  children,
}: {
  headingId: string;
  title: string;
  state?: ChannelStatus;
  busy: boolean;
  message?: string;
  onRetest: () => void;
  children: ReactNode;
}) {
  const verified = state?.status === 'verified_pass';
  return (
    <section className="settings-card" aria-labelledby={headingId}>
      <div className="settings-card-head">
        <h2 id={headingId}>{title}</h2>
        <span className={`status-badge ${verified ? 'status-success' : ''}`}>{verified ? '已通过' : '未配置'}</span>
      </div>
      {state?.summary && <p>{state.summary} · {state.lastVerified ?? '验证时间未知'}</p>}
      {state?.errorCode && <p className="semester-error">{state.errorCode}</p>}
      {children}
      <div className="settings-actions">
        {verified && (
          <button type="button" className="button-secondary" disabled={busy} onClick={onRetest}>
            重新测试
          </button>
        )}
        {message && <span role="status">{message}</span>}
      </div>
    </section>
  );
}
