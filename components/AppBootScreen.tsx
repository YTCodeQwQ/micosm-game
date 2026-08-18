import Image from "next/image";
import styles from "./AppBootScreen.module.css";

export function AppBootScreen() {
  return (
    <main aria-busy="true" aria-live="polite" className={styles.screen}>
      <section className={styles.content}>
        <span className={styles.logo}><Image alt="" height={64} priority src="/micosm-logo.webp" unoptimized width={64} /></span>
        <div><strong>Micosm</strong><p>正在进入你的小世界</p></div>
        <span aria-hidden="true" className={styles.progress}><i /></span>
      </section>
    </main>
  );
}
