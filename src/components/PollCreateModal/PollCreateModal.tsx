import { useState } from "preact/hooks";
import { serverUrl, currentChannel, currentThread } from "../../state";
import { wsSend } from "../../lib/websocket";
import { Icon } from "../Icon";
import styles from "./PollCreateModal.module.css";

interface PollCreateModalProps {
  onClose: () => void;
}

interface PollOptionInput {
  id: string;
  text: string;
  emoji: string;
}

export function PollCreateModal({ onClose }: PollCreateModalProps) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<PollOptionInput[]>([
    { id: "1", text: "", emoji: "" },
    { id: "2", text: "", emoji: "" },
  ]);
  const [allowMultiselect, setAllowMultiselect] = useState(false);
  const [durationHours, setDurationHours] = useState<number>(24);
  const [hasExpiration, setHasExpiration] = useState(true);

  const addOption = () => {
    if (options.length >= 10) return;
    const newId = String(options.length + 1);
    setOptions([...options, { id: newId, text: "", emoji: "" }]);
  };

  const removeOption = (id: string) => {
    if (options.length <= 2) return;
    setOptions(options.filter((o) => o.id !== id));
  };

  const updateOption = (id: string, field: "text" | "emoji", value: string) => {
    setOptions(
      options.map((o) => (o.id === id ? { ...o, [field]: value } : o)),
    );
  };

  const handleSubmit = () => {
    if (!question.trim()) return;
    const validOptions = options.filter((o) => o.text.trim());
    if (validOptions.length < 2) return;

    const channel = currentChannel.value;
    if (!channel) return;

    const payload: any = {
      cmd: "poll_create",
      question: question.trim(),
      options: validOptions.map((o) => ({
        text: o.text.trim(),
        emoji: o.emoji || undefined,
      })),
      allow_multiselect: allowMultiselect,
    };

    if (channel.type === "thread") {
      payload.thread_id = currentThread.value?.id;
    } else {
      payload.channel = channel.name;
    }

    if (hasExpiration && durationHours > 0) {
      payload.duration_hours = durationHours;
    }

    wsSend(payload, serverUrl.value);
    onClose();
  };

  const isValid =
    question.trim().length > 0 &&
    options.filter((o) => o.text.trim()).length >= 2;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3>Create Poll</h3>
          <button className={styles.closeBtn} onClick={onClose}>
            <Icon name="X" size={18} />
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.field}>
            <label>Question</label>
            <input
              type="text"
              value={question}
              onInput={(e) => setQuestion((e.target as HTMLInputElement).value)}
              placeholder="Ask a question..."
              maxLength={300}
            />
            <span className={styles.charCount}>{question.length}/300</span>
          </div>

          <div className={styles.field}>
            <label>Options</label>
            <div className={styles.optionsList}>
              {options.map((option, index) => (
                <div key={option.id} className={styles.optionRow}>
                  <input
                    type="text"
                    value={option.emoji}
                    onInput={(e) =>
                      updateOption(
                        option.id,
                        "emoji",
                        (e.target as HTMLInputElement).value,
                      )
                    }
                    placeholder="🗳️"
                    className={styles.emojiInput}
                    maxLength={10}
                  />
                  <input
                    type="text"
                    value={option.text}
                    onInput={(e) =>
                      updateOption(
                        option.id,
                        "text",
                        (e.target as HTMLInputElement).value,
                      )
                    }
                    placeholder={`Option ${index + 1}`}
                    className={styles.textInput}
                    maxLength={100}
                  />
                  {options.length > 2 && (
                    <button
                      className={styles.removeBtn}
                      onClick={() => removeOption(option.id)}
                    >
                      <Icon name="X" size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {options.length < 10 && (
              <button className={styles.addOptionBtn} onClick={addOption}>
                <Icon name="Plus" size={14} /> Add Option
              </button>
            )}
          </div>

          <div className={styles.field}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={allowMultiselect}
                onChange={(e) =>
                  setAllowMultiselect((e.target as HTMLInputElement).checked)
                }
              />
              Allow multiple selections
            </label>
          </div>

          <div className={styles.field}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={hasExpiration}
                onChange={(e) =>
                  setHasExpiration((e.target as HTMLInputElement).checked)
                }
              />
              Set expiration time
            </label>
          </div>

          {hasExpiration && (
            <div className={styles.field}>
              <label>Duration (hours)</label>
              <input
                type="number"
                value={durationHours}
                onInput={(e) =>
                  setDurationHours(
                    parseInt((e.target as HTMLInputElement).value) || 0,
                  )
                }
                min={1}
                max={168}
                className={styles.durationInput}
              />
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button
            className={styles.createBtn}
            onClick={handleSubmit}
            disabled={!isValid}
          >
            Create Poll
          </button>
        </div>
      </div>
    </div>
  );
}
