"use client"

import { Pencil, Plus, Trash2 } from "lucide-react"
import { useActionState, useState } from "react"

import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MAX_NAME_LENGTH } from "@/lib/portfolio-rules"

import { type ActionState, createPortfolio, deletePortfolio, renamePortfolio } from "./actions"

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>

/** Runs a Server Action from a dialog form and closes the dialog when it succeeds. */
function useDialogAction(action: Action) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await action(prev, formData)
    if (result.ok) setOpen(false)
    return result
  }, {})
  return { open, setOpen, state, formAction, pending }
}

function ErrorText({ state }: { state: ActionState }) {
  return state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null
}

function NameField({ defaultValue }: { defaultValue?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="portfolio-name">Portfolio name</Label>
      <Input id="portfolio-name" name="name" required maxLength={MAX_NAME_LENGTH} autoComplete="off"
             defaultValue={defaultValue} placeholder="e.g. Long-term global mix" autoFocus />
    </div>
  )
}

export function NewPortfolioDialog() {
  const { open, setOpen, state, formAction, pending } = useDialogAction(createPortfolio)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus aria-hidden /> New portfolio
      </DialogTrigger>
      <DialogContent>
        <form action={formAction} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New portfolio</DialogTitle>
            <DialogDescription>You can change the name later.</DialogDescription>
          </DialogHeader>
          <NameField />
          <ErrorText state={state} />
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function RenamePortfolioDialog({ id, name }: { id: string; name: string }) {
  const { open, setOpen, state, formAction, pending } = useDialogAction(renamePortfolio)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" aria-label={`Rename ${name}`} />}>
        <Pencil aria-hidden /> <span className="hidden sm:inline">Rename</span>
      </DialogTrigger>
      <DialogContent>
        <form action={formAction} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Rename portfolio</DialogTitle>
          </DialogHeader>
          <input type="hidden" name="id" value={id} />
          <NameField defaultValue={name} />
          <ErrorText state={state} />
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function DeletePortfolioDialog({ id, name }: { id: string; name: string }) {
  const { open, setOpen, state, formAction, pending } = useDialogAction(deletePortfolio)
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" aria-label={`Delete ${name}`} />}>
        <Trash2 aria-hidden /> <span className="hidden sm:inline">Delete</span>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <form action={formAction} className="space-y-4">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the portfolio and its ETF selection. You can&apos;t undo this.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input type="hidden" name="id" value={id} />
          <ErrorText state={state} />
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Deleting…" : "Delete portfolio"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
