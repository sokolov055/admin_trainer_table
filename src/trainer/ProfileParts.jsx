import React, { useRef, useState } from 'react';

import { apiMutate } from '../api.js';
import { Field, Note, Options } from '../ui.jsx';
import { IconAlert, IconCheck, IconPlus, IconUsers } from '../icons.jsx';
import { mediaUrl, shrinkPhoto, uploadProfilePhoto } from '../library.js';
import { haptic } from '../telegram.js';

/**
 * Профиль тренера (FT-548) — части, общие для анкеты кандидата
 * (CandidateApp.jsx), своего профиля тренера (TrainerProfile.jsx), экрана
 * владельца (Trainers.jsx) и «Моего тренера» у клиента.
 *
 * Поля и их пределы задаёт сервер (lib/trainer-profiles.js): здесь — только
 * форма. Контактов в публичной части нет намеренно: связь с тренером — через
 * приложение, а телефон в открытом профиле — лишние данные в распространении.
 */

// Документы — с адреса сайта, как в Consent.jsx: в приложении на телефоне
// относительная ссылка открыла бы вшитый файл без браузера
const BASE = 'https://app.fitness100.ru/';

export const EMPTY_PROFILE = {
  name: '', photo: '', city: '', formats: [], gyms: '', experience: null, specialties: [], about: '', priceFrom: null,
};

const digits = (v) => {
  const n = String(v).replace(/\D/g, '');
  return n === '' ? null : Number(n);
};

/** Ряд переключателей «можно несколько» */
function MultiChips({ items, value = [], onChange, disabled, label }) {
  const toggle = (key) => onChange(value.includes(key) ? value.filter((v) => v !== key) : [...value, key]);
  return (
    <div className="chips chips--wrap profile-form__chips" role="group" aria-label={label}>
      {items.map(([key, text]) => {
        const on = value.includes(key);
        return (
          <button
            key={key}
            type="button"
            className={'chip' + (on ? ' chip--active' : '')}
            aria-pressed={on}
            disabled={disabled}
            onClick={() => { toggle(key); haptic(); }}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}

/** Многострочное поле в стиле Field */
export function TextArea({ label, hint, value, onChange, disabled, rows = 4, maxLength }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <textarea
        className="field__input profile-form__area"
        rows={rows}
        maxLength={maxLength}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}

/** Фото профиля: выбрать → уменьшить на телефоне (без места съёмки) → загрузить */
function PhotoPicker({ value, onUploaded, disabled }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const pick = async (file) => {
    if (!file) return;
    setBusy(true);
    setProblem('');
    try {
      const blob = await shrinkPhoto(file, 1200);
      const { url } = await uploadProfilePhoto(blob);
      onUploaded(url);
      haptic('success');
    } catch (error) {
      setProblem(error.message || 'Не получилось загрузить фото.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <div className="profile-form__photo">
      <span className="profile-photo" aria-hidden={!value}>
        {value ? <img src={mediaUrl(value)} alt="Фото профиля" /> : <IconUsers size={28} />}
      </span>
      <div className="profile-form__photo-copy">
        <button type="button" className="button button--ghost" disabled={disabled || busy} onClick={() => input.current && input.current.click()}>
          <IconPlus size={16} /> {busy ? 'Загружаем…' : value ? 'Сменить фото' : 'Добавить фото'}
        </button>
        <span className="small muted">Своё лицо, хорошо видно. Клиенты увидят фото после проверки.</span>
        {problem && <span className="field__error">{problem}</span>}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => pick(e.target.files && e.target.files[0])} />
    </div>
  );
}

/** Публичная часть профиля — то, что увидят клиенты */
export function ProfileFields({ value, onChange, dicts = {}, disabled }) {
  const set = (key) => (v) => onChange({ ...value, [key]: v });
  const formats = Object.entries(dicts.formats || {});
  const specialties = (dicts.specialties || []).map((s) => [s, s]);
  return (
    <div className="profile-form">
      <PhotoPicker value={value.photo} onUploaded={set('photo')} disabled={disabled} />
      <Field label="Имя и фамилия" inputMode="text" value={value.name} onChange={set('name')} disabled={disabled} />
      <Field label="Город" inputMode="text" value={value.city} onChange={set('city')} disabled={disabled} />
      <div className="field">
        <span className="field__label">Как занимаетесь</span>
        <MultiChips items={formats} value={value.formats} onChange={set('formats')} disabled={disabled} label="Как занимаетесь" />
      </div>
      <Field label="Залы" hint="Где проводите тренировки — название и район" inputMode="text" value={value.gyms} onChange={set('gyms')} disabled={disabled} />
      <Field
        label="Опыт, лет"
        value={value.experience === null || value.experience === undefined ? '' : String(value.experience)}
        onChange={(v) => set('experience')(digits(v))}
        disabled={disabled}
      />
      <div className="field">
        <span className="field__label">Направления</span>
        <MultiChips items={specialties} value={value.specialties} onChange={set('specialties')} disabled={disabled} label="Направления" />
      </div>
      <Field
        label="Цена занятия от, ₽"
        hint="Необязательно"
        value={value.priceFrom === null || value.priceFrom === undefined ? '' : String(value.priceFrom)}
        onChange={(v) => set('priceFrom')(digits(v))}
        disabled={disabled}
      />
      <TextArea
        label="О себе"
        hint="Как работаете и с кем. Без обещаний вылечить и гарантий результата"
        rows={5}
        maxLength={1500}
        value={value.about}
        onChange={set('about')}
        disabled={disabled}
      />
    </div>
  );
}

/** Профиль глазами клиента */
export function ProfileCard({ profile, formats = {}, onReport }) {
  const facts = [
    profile.city,
    (profile.formats || []).map((f) => formats[f] || f).join(', '),
    profile.experience !== null && profile.experience !== undefined ? 'опыт ' + profile.experience + ' ' + years(profile.experience) : '',
  ].filter(Boolean);
  return (
    <article className="profile-card">
      <header className="profile-card__head">
        <span className="profile-photo profile-photo--big">
          {profile.photo ? <img src={mediaUrl(profile.photo)} alt="" /> : <IconUsers size={32} />}
        </span>
        <div className="profile-card__title">
          <h2>{profile.name}</h2>
          <p className="small muted">{facts.join(' · ')}</p>
          {profile.docsChecked && <span className="profile-card__badge"><IconCheck size={14} /> Документы проверены</span>}
        </div>
      </header>
      {(profile.specialties || []).length > 0 && (
        <div className="chips chips--wrap profile-card__tags">
          {profile.specialties.map((s) => <span key={s} className="chip">{s}</span>)}
        </div>
      )}
      {profile.about && <p className="profile-card__about">{profile.about}</p>}
      {profile.gyms && <p className="small"><span className="muted">Залы: </span>{profile.gyms}</p>}
      {profile.priceFrom ? <p className="small"><span className="muted">Занятие </span>от {profile.priceFrom.toLocaleString('ru-RU')} ₽</p> : null}
      {onReport && (
        <button type="button" className="profile-card__report" onClick={onReport}>
          <IconAlert size={14} /> Пожаловаться на профиль
        </button>
      )}
    </article>
  );
}

function years(n) {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return 'год';
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return 'года';
  return 'лет';
}

/**
 * Жалоба на профиль (App Store 1.2). Причина — из списка сервера; «Другое»
 * — только с пояснением. Повторная жалоба того же человека заменяет
 * прежнюю, а не множит её (lib/trainer-profiles.js).
 */
export function ReportForm({ trainerId, reasons = {}, onDone, onCancel }) {
  const [reason, setReason] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <Note tone="good">
        Жалоба отправлена. Мы посмотрим профиль и, если правила нарушены, скроем его.
        {onDone && <> <button type="button" className="link-button" onClick={onDone}>Готово</button></>}
      </Note>
    );
  }

  const send = async () => {
    setBusy(true);
    setProblem('');
    try {
      await apiMutate('trainer.profile.report', { trainerId, reason, text: text.trim() });
      haptic('success');
      setSent(true);
    } catch (error) {
      setProblem(error.message || 'Не получилось отправить. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="report-form">
      <p className="small">Что не так с профилем?</p>
      <Options items={Object.entries(reasons).map(([value, label]) => ({ value, label }))} value={reason} onChange={setReason} label="Причина" disabled={busy} />
      <TextArea label={reason === 'other' ? 'Опишите, что не так' : 'Подробнее (необязательно)'} rows={3} maxLength={1000} value={text} onChange={setText} disabled={busy} />
      {problem && <p className="field__error" role="alert">{problem}</p>}
      <div className="survey__actions">
        <button type="button" className="button button--primary" disabled={busy || !reason || (reason === 'other' && text.trim().length < 5)} onClick={send}>
          {busy ? 'Отправляем…' : 'Отправить жалобу'}
        </button>
        {onCancel && <button type="button" className="button button--ghost" disabled={busy} onClick={onCancel}>Отмена</button>}
      </div>
    </div>
  );
}

/** Ссылка на документ рядом с галочкой согласия */
export function docLink(file, text) {
  return <a href={BASE + file} target="_blank" rel="noopener noreferrer">{text}</a>;
}
