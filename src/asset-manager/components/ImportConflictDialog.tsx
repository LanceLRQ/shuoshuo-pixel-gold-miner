import type { ThemeJson } from '../../assets/themeLoader';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  theme: ThemeJson | null;
  onResolve: (action: 'overwrite' | 'duplicate' | 'cancel') => void;
}

export function ImportConflictDialog({ theme, onResolve }: Props) {
  return (
    <Dialog
      open={theme !== null}
      onOpenChange={(v) => !v && onResolve('cancel')}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>主题 ID 已存在</DialogTitle>
          <DialogDescription>
            {theme &&
              `自定义主题 "${theme.id}" 已存在，请选择处理方式。`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onResolve('cancel')}>
            取消
          </Button>
          <Button variant="outline" onClick={() => onResolve('duplicate')}>
            导入为副本
          </Button>
          <Button
            variant="destructive"
            onClick={() => onResolve('overwrite')}
          >
            覆盖
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
