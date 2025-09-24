import { useRef, useState } from 'react';
import PropTypes from 'prop-types';

const FileSharing = ({ files, onSendFile, disabled }) => {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handleSelectFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = () => {
        onSendFile({
          fileName: file.name,
          fileType: file.type,
          fileData: reader.result,
        });
        setUploading(false);
      };
      reader.onerror = () => {
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setUploading(false);
    } finally {
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Файлы</h3>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
          className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 transition text-xs font-semibold disabled:opacity-60"
        >
          {uploading ? 'Загрузка...' : 'Отправить файл'}
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={handleSelectFile}
        />
      </div>
      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
        {files.map((file) => (
          <div key={file.timestamp + file.fileName} className="bg-white/5 border border-white/10 rounded-2xl p-3">
            <div className="text-xs text-indigo-300 mb-1">{file.sender}</div>
            <a
              href={file.fileData}
              download={file.fileName}
              className="text-sm text-sky-300 hover:text-sky-200 break-all"
            >
              {file.fileName}
            </a>
          </div>
        ))}
        {files.length === 0 && <p className="text-xs text-slate-400">Файлы пока не отправлялись.</p>}
      </div>
    </div>
  );
};

export default FileSharing;

FileSharing.propTypes = {
  files: PropTypes.arrayOf(
    PropTypes.shape({
      sender: PropTypes.string.isRequired,
      fileName: PropTypes.string.isRequired,
      fileType: PropTypes.string,
      fileData: PropTypes.string.isRequired,
      timestamp: PropTypes.number.isRequired,
    })
  ).isRequired,
  onSendFile: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

FileSharing.defaultProps = {
  disabled: false,
};
