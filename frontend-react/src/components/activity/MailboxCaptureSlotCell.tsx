import { useRef, useState, type ChangeEvent } from 'react';
import {
  mailboxStatusBadgeClass,
  mailboxSideStatusLabel,
  mailboxTypeLabel,
  type MailboxType,
} from './sunatInboxConfig';
import type { SunatInboxCaptureSlot, SunatInboxMailboxSide } from '../../services/sunatInbox';

type MailboxSideCellProps = {
  side: SunatInboxMailboxSide;
  mailboxType: MailboxType;
  canUpload: boolean;
  canVerify: boolean;
  uploading: boolean;
  verifying: boolean;
  onUpload: (file: File) => Promise<void>;
  onVerify: () => Promise<void>;
};

function MailboxSideCell({
  side,
  mailboxType,
  canUpload,
  canVerify,
  uploading,
  verifying,
  onUpload,
  onVerify,
}: MailboxSideCellProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await onUpload(file);
  };

  return (
    <div className="rounded border border-slate-200 bg-white/80 p-1.5 space-y-1 min-w-[7.5rem]">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-semibold text-slate-600">{mailboxTypeLabel(mailboxType)}</span>
        <span
          className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium ${mailboxStatusBadgeClass(side.status)}`}
        >
          {mailboxSideStatusLabel(side.status)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {side.file_url ? (
          <a
            href={side.file_url}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-primary-700 hover:underline truncate max-w-full"
            title={side.file_name}
          >
            Ver archivo
          </a>
        ) : (
          <span className="text-[10px] text-slate-400">Sin archivo</span>
        )}
        {canUpload && side.status !== 'verificado' ? (
          <>
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="text-[10px] font-medium text-primary-700 hover:underline disabled:opacity-50"
            >
              {uploading ? '…' : 'Subir'}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,image/*"
              className="hidden"
              onChange={(e) => void handleFile(e)}
            />
          </>
        ) : null}
        {canVerify && side.status === 'cargado' ? (
          <button
            type="button"
            disabled={verifying}
            onClick={() => void onVerify()}
            className="text-[10px] font-medium text-emerald-700 hover:underline disabled:opacity-50"
            title="Marcar como verificado"
          >
            <i className="fas fa-check mr-0.5" aria-hidden />
            {verifying ? '…' : 'Verificar'}
          </button>
        ) : null}
      </div>
    </div>
  );
}

type MailboxCaptureSlotCellProps = {
  slot: SunatInboxCaptureSlot;
  canUpload: boolean;
  canVerify: boolean;
  uploadKey: string;
  onUpload: (slotIndex: number, mailboxType: MailboxType, file: File) => Promise<void>;
  onVerify: (slotId: number, mailboxType: MailboxType) => Promise<void>;
};

export function MailboxCaptureSlotCell({
  slot,
  canUpload,
  canVerify,
  uploadKey,
  onUpload,
  onVerify,
}: MailboxCaptureSlotCellProps) {
  const [uploadingType, setUploadingType] = useState<MailboxType | null>(null);
  const [verifyingType, setVerifyingType] = useState<MailboxType | null>(null);

  const handleUpload = async (mailboxType: MailboxType, file: File) => {
    try {
      setUploadingType(mailboxType);
      await onUpload(slot.slot_index, mailboxType, file);
    } finally {
      setUploadingType(null);
    }
  };

  const handleVerify = async (mailboxType: MailboxType) => {
    if (!slot.id) return;
    try {
      setVerifyingType(mailboxType);
      await onVerify(slot.id, mailboxType);
    } finally {
      setVerifyingType(null);
    }
  };

  return (
    <div className="space-y-1" key={`${uploadKey}-slot-${slot.slot_index}`}>
      <MailboxSideCell
        side={slot.sunat}
        mailboxType="sunat"
        canUpload={canUpload}
        canVerify={canVerify}
        uploading={uploadingType === 'sunat'}
        verifying={verifyingType === 'sunat'}
        onUpload={(file) => handleUpload('sunat', file)}
        onVerify={() => handleVerify('sunat')}
      />
      <MailboxSideCell
        side={slot.sunafil}
        mailboxType="sunafil"
        canUpload={canUpload}
        canVerify={canVerify}
        uploading={uploadingType === 'sunafil'}
        verifying={verifyingType === 'sunafil'}
        onUpload={(file) => handleUpload('sunafil', file)}
        onVerify={() => handleVerify('sunafil')}
      />
    </div>
  );
}

export function MailboxCaptureSlotHeader({ slotIndex }: { slotIndex: number }) {
  return (
    <th className="px-2 py-3 text-center text-xs font-semibold uppercase text-slate-500 whitespace-nowrap min-w-[9rem]">
      Carga {slotIndex}
    </th>
  );
}
