/**
 * components/Composer.tsx — 增强输入框 (Phase 1.2)
 *
 * 功能:
 * - 多行输入，Enter 发送，Shift+Enter 换行
 * - @ 触发弹窗：搜索专家/工作区
 * - / 触发弹窗：命令列表
 * - 文件拖拽区域
 * - Ctrl+Enter 发送
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';

const EXPERT_LIST = [
  { id: 'strategy', name: '战略顾问', emoji: '🎯' },
  { id: 'finance', name: '财务专家', emoji: '💰' },
  { id: 'org', name: '组织专家', emoji: '🏢' },
  { id: 'tech', name: '技术专家', emoji: '⚙️' },
  { id: 'marketing', name: '营销专家', emoji: '📈' },
  { id: 'action', name: '行动顾问', emoji: '✅' },
  { id: 'business_model', name: '商业模式专家', emoji: '📊' },
  { id: 'knowledge', name: '知识专家', emoji: '📚' },
];

const COMMAND_LIST = [
  { id: '/diagnosis', label: '/诊断', desc: '启动全面组织诊断' },
  { id: '/summary', label: '/摘要', desc: '生成当前会话摘要' },
  { id: '/export', label: '/导出', desc: '导出诊断报告' },
  { id: '/plan', label: '/方案', desc: '生成落地执行方案' },
];

interface ComposerProps {
  onSend: (text: string, mentions: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

const Composer: React.FC<ComposerProps> = ({
  onSend,
  disabled = false,
  placeholder = '描述你的组织问题...',
}) => {
  const [value, setValue] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [mentions, setMentions] = useState<string[]>([]);
  const [isComposing, setIsComposing] = useState(false); // Phase 5.4: IME 组合态
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionIndex = useRef(-1);

  // 处理输入变化
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setValue(val);

    // 检测 @mention
    const atMatch = val.match(/@(\w*)$/);
    if (atMatch) {
      setShowMentions(true);
      setShowCommands(false);
      setMentionQuery(atMatch[1].toLowerCase());
      mentionIndex.current = -1;
    } else {
      setShowMentions(false);
    }

    // 检测 /command
    if (val === '/') {
      setShowCommands(true);
      setShowMentions(false);
    } else if (val.length > 1 && !val.includes(' ')) {
      // 只在行首无空格时显示命令
    } else {
      setShowCommands(false);
    }
  }, []);

  // 选择专家
  const selectExpert = useCallback((expertId: string, expertName: string) => {
    setValue((prev) => prev.replace(/@\w*$/, ''));
    setMentions((prev) => [...prev, expertId]);
    setShowMentions(false);
    textareaRef.current?.focus();
  }, []);

  // 选择命令
  const selectCommand = useCallback((cmd: string) => {
    setValue(cmd + ' ');
    setShowCommands(false);
    textareaRef.current?.focus();
  }, []);

  // 发送消息
  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed, mentions);
    setValue('');
    setMentions([]);
    setShowMentions(false);
    setShowCommands(false);
  }, [value, disabled, mentions, onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Phase 5.4: IME 组合态不发送
    if (isComposing) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape') {
      setShowMentions(false);
      setShowCommands(false);
    }
  }, [handleSend, isComposing]);

  // 文件拖拽
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    // Phase 1.3: 实际文件上传
  }, []);

  // 过滤专家列表
  const filteredExperts = EXPERT_LIST.filter(
    (e) => !mentionQuery || e.name.includes(mentionQuery) || e.id.includes(mentionQuery),
  );

  return (
    <div
      className={`composer${isDragOver ? ' composer-dragover' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* @提及弹窗 */}
      {showMentions && filteredExperts.length > 0 && (
        <div className="composer-popup fade-in">
          <div className="composer-popup-title">提及专家</div>
          {filteredExperts.map((exp) => (
            <button
              key={exp.id}
              className="composer-popup-item"
              onClick={() => selectExpert(exp.id, exp.name)}
            >
              <span>{exp.emoji}</span>
              <span>{exp.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* /命令弹窗 */}
      {showCommands && (
        <div className="composer-popup fade-in">
          <div className="composer-popup-title">命令</div>
          {COMMAND_LIST.map((cmd) => (
            <button
              key={cmd.id}
              className="composer-popup-item"
              onClick={() => selectCommand(cmd.id)}
            >
              <span className="composer-popup-cmd">{cmd.label}</span>
              <span className="composer-popup-desc">{cmd.desc}</span>
            </button>
          ))}
        </div>
      )}

      {/* @提及标签 */}
      {mentions.length > 0 && (
        <div className="composer-mentions">
          {mentions.map((m) => {
            const exp = EXPERT_LIST.find((e) => e.id === m);
            return (
              <span key={m} className="composer-mention-tag">
                {exp?.emoji} {exp?.name || m}
                <button
                  className="composer-mention-remove"
                  onClick={() => setMentions((prev) => prev.filter((x) => x !== m))}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* 输入框 */}
      <div className="composer-input-row">
        <textarea
          ref={textareaRef}
          className="composer-input"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          placeholder={placeholder}
          rows={2}
          disabled={disabled}
        />
        <button
          className="composer-send-btn"
          onClick={handleSend}
          disabled={!value.trim() || disabled}
        >
          发送
        </button>
      </div>

      {/* 拖拽覆盖层 */}
      {isDragOver && (
        <div className="composer-dragoverlay">
          <span>📎 释放以上传文件</span>
        </div>
      )}
    </div>
  );
};

export default React.memo(Composer);
